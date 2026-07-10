// Password step of member password+2FA login. Flow:
// POST here (email+password) -> {step:'done'} if the browser is trusted
// (skips 2FA) else {step:'2fa', method, memberId} -> POST /api/members/auth/2fa/verify
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { verifyPassword } from '@/lib/auth/password'
import { getMembersConfig } from '@/lib/members/config'
import { loginRejectionForStatus } from '@/lib/members/registration'
import { createMemberEmailChallenge } from '@/lib/members/email-challenge'
import { getActiveSmsProvider, sendLoginCodeSms, maskPhone } from '@/lib/auth/sms'
import { decryptSecret } from '@/lib/crypto/secrets'
import { memberNeedsSmsEnrolment } from '@/lib/members/sms-policy'
import { createMemberSession, setMemberSessionCookie, isMemberBrowserTrusted } from '@/lib/members/session'
import { sendLoginOtp } from '@/lib/email/index'
import { verifyTurnstile } from '@/lib/auth/turnstile'
import { checkAndRecord, getClientIp } from '@/lib/auth/rate-limit'
import { isEmailConfigured } from '@/lib/config/env'

const Body = z.object({
  email: z.string().email(),
  password: z.string(),
  turnstileToken: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const config = await getMembersConfig()
  if (!config.enabled || !config.passwordsEnabled) {
    return NextResponse.json({ error: 'Password sign-in is not available' }, { status: 403 })
  }

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  const { email, password, turnstileToken } = parsed.data

  const ts = await verifyTurnstile(turnstileToken)
  if (!ts) {
    return NextResponse.json({ error: 'Bot check failed. Please try again.' }, { status: 400 })
  }

  const ip = await getClientIp(request)
  const rl = await checkAndRecord('member_login', [`ip:${ip}`, `account_email:${email}`])
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many login attempts. Please wait and try again.' }, { status: 429 })
  }

  const member = await prisma.member.findUnique({
    where: { email },
    include: { password: true, twoFactorConfigs: true },
  })

  // Constant-time-ish: always hash even when the account or password doesn't exist.
  const hash = member?.password?.hash ?? '$2b$12$invalid.hash.to.prevent.timing.attacks.xxxxxxxxxx'
  const valid = await verifyPassword(password, hash)
  if (!member?.password || !valid) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  // Only reveal a status-specific rejection once the password is confirmed
  // correct - a wrong-password guess on a suspended account still just gets
  // the generic message above.
  const rejection = loginRejectionForStatus(member.status)
  if (rejection) {
    return NextResponse.json(
      { error: rejection.error, redirectToVerify: rejection.redirectToVerify },
      { status: 403 }
    )
  }

  if (await isMemberBrowserTrusted(member.id)) {
    const token = await createMemberSession(member.id, {
      ipAddress: ip,
      userAgent: request.headers.get('user-agent') ?? undefined,
    })
    await setMemberSessionCookie(token)
    return NextResponse.json({
      step: 'done',
      memberId: member.id,
      smsEnrolmentRequired: await memberNeedsSmsEnrolment(config, member.twoFactorConfigs),
    })
  }

  // A verified SMS config takes priority when a provider module can actually
  // deliver texts; otherwise fall back to whatever else is configured. SMS and
  // EMAIL share the same challenge store, so the verify route stays in step.
  const configs = member.twoFactorConfigs
  const smsConfig = configs.find((c) => c.method === 'SMS' && c.verified && c.phoneEncrypted)
  const twoFactor = smsConfig ?? configs.find((c) => c.method !== 'SMS') ?? configs[0]
  if (!twoFactor) {
    return NextResponse.json(
      { error: 'Two-factor authentication is required but not yet configured for this account.' },
      { status: 403 }
    )
  }

  let method = twoFactor.method
  let destination: string | undefined

  if (method === 'SMS') {
    let sent = false
    const provider = await getActiveSmsProvider()
    if (provider && twoFactor.phoneEncrypted) {
      try {
        const phone = decryptSecret(twoFactor.phoneEncrypted)
        const code = await createMemberEmailChallenge(member.id, 'login_2fa')
        const siteConfig = await prisma.siteConfig.findUnique({
          where: { id: 'singleton' },
          select: { siteName: true },
        })
        await sendLoginCodeSms(provider, phone, code, siteConfig?.siteName ?? 'Cactus')
        destination = maskPhone(phone)
        sent = true
      } catch (err) {
        console.error('[member-login] SMS delivery failed, falling back to email:', err)
      }
    }
    // Provider gone or the text failed - never lock the member out.
    if (!sent) method = 'EMAIL'
  }

  if (method === 'EMAIL') {
    if (!isEmailConfigured()) {
      return NextResponse.json({ error: 'Two-factor email delivery is not available' }, { status: 503 })
    }
    const code = await createMemberEmailChallenge(member.id, 'login_2fa')
    const siteConfig = await prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { siteName: true },
    })
    await sendLoginOtp(member.email, code, siteConfig?.siteName ?? 'Cactus')
  }

  return NextResponse.json({ step: '2fa', method, memberId: member.id, destination })
}
