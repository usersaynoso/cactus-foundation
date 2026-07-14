// Second factor for password login. Verifies whichever method the member has
// configured (EMAIL code or AUTHENTICATOR_APP/TOTP) and creates the session.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { verifyMemberEmailChallenge } from '@/lib/members/email-challenge'
import { verifyTotpCode } from '@/lib/auth/totp'
import { tryDecryptSecret } from '@/lib/crypto/secrets'
import { loginRejectionForStatus } from '@/lib/members/registration'
import {
  createMemberSession,
  setMemberSessionCookie,
  createMemberTrustedBrowser,
  setMemberTrustedBrowserCookie,
} from '@/lib/members/session'
import { checkAndRecord, getClientIp } from '@/lib/auth/rate-limit'
import { getMembersConfig } from '@/lib/members/config'
import { memberNeedsSmsEnrolment } from '@/lib/members/sms-policy'
import { recordMemberActivity } from '@/lib/members/activity'
import { notifyMemberSecurityAlert } from '@/lib/members/security-alerts'

const Body = z.object({
  memberId: z.string(),
  code: z.string().min(6).max(6),
  trustBrowser: z.boolean().default(false),
})

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  const { memberId, code, trustBrowser } = parsed.data

  const ip = await getClientIp(request)
  const rl = await checkAndRecord('member_2fa', [`ip:${ip}`, `account:${memberId}`])
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many attempts. Please wait and try again.' }, { status: 429 })
  }

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: { twoFactorConfigs: true },
  })
  // Mirror the selection in password/login so both steps agree on the method.
  // SMS codes live in the same challenge store as EMAIL codes (only the
  // delivery differs), so both verify through verifyMemberEmailChallenge -
  // which also covers the login route's silent SMS→email fallback.
  const configs = member?.twoFactorConfigs ?? []
  const twoFactor =
    configs.find((c) => c.method === 'SMS' && c.verified && c.phoneEncrypted) ??
    configs.find((c) => c.method !== 'SMS') ??
    configs[0]
  if (!member || !twoFactor) {
    return NextResponse.json({ error: 'Invalid or expired code' }, { status: 401 })
  }

  if (twoFactor.method === 'EMAIL' || twoFactor.method === 'SMS') {
    const result = await verifyMemberEmailChallenge(memberId, 'login_2fa', code)
    if (!result.success) {
      const message =
        result.reason === 'max_attempts' ? 'Too many incorrect attempts. Please sign in again.' :
        result.reason === 'expired' ? 'Code has expired. Please sign in again.' :
        'Incorrect code'
      return NextResponse.json({ error: message }, { status: 401 })
    }
  } else {
    // A secret this site's ENCRYPTION_KEY cannot read came from another install
    // (restored backup, rotated key) and no code will ever match it. Same answer
    // as no enrolment at all, rather than a 500 full of OpenSSL.
    const secret = tryDecryptSecret(twoFactor.secretEncrypted)
    if (!secret) {
      return NextResponse.json({ error: 'Invalid or expired code' }, { status: 401 })
    }
    const result = verifyTotpCode(secret, code, twoFactor.lastStep)
    if (!result.valid) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 401 })
    }
    await prisma.memberTwoFactor.update({ where: { id: twoFactor.id }, data: { lastStep: result.step } })
  }

  const rejection = loginRejectionForStatus(member.status)
  if (rejection) {
    return NextResponse.json(
      { error: rejection.error, redirectToVerify: rejection.redirectToVerify },
      { status: 403 }
    )
  }

  const token = await createMemberSession(member.id, {
    ipAddress: ip,
    userAgent: request.headers.get('user-agent') ?? undefined,
  })
  await setMemberSessionCookie(token)

  if (trustBrowser) {
    const trustToken = await createMemberTrustedBrowser(member.id, request.headers.get('user-agent') ?? undefined)
    await setMemberTrustedBrowserCookie(trustToken)
    await notifyMemberSecurityAlert(member, 'A new browser was marked as trusted on your account.')
  }

  await recordMemberActivity(member.id, 'login', { metadata: { method: 'PASSWORD', twoFactor: twoFactor.method } })

  return NextResponse.json({
    verified: true,
    memberId: member.id,
    smsEnrolmentRequired: await memberNeedsSmsEnrolment(await getMembersConfig(), configs),
  })
}
