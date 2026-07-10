// Password + email-OTP login (fallback when email is configured).
// Flow: POST email+password → 200 with {step:'otp'} if creds valid →
//       POST /api/auth/email-code with OTP → session created.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { verifyPassword } from '@/lib/auth/password'
import { createEmailChallenge } from '@/lib/auth/email-challenge'
import { sendLoginOtp } from '@/lib/email/index'
import { verifyTurnstile } from '@/lib/auth/turnstile'
import { getActiveSmsProvider, sendLoginCodeSms, maskPhone } from '@/lib/auth/sms'
import { decryptSecret } from '@/lib/crypto/secrets'
import { checkAndRecord, getClientIp } from '@/lib/auth/rate-limit'
import { isEmailConfigured } from '@/lib/config/env'

const Body = z.object({
  email: z.string().email(),
  password: z.string(),
  turnstileToken: z.string().optional(),
})

export async function POST(request: NextRequest) {
  if (!isEmailConfigured()) {
    return NextResponse.json({ error: 'Password login is not available (email not configured)' }, { status: 503 })
  }

  const ip = await getClientIp(request)
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const { email, password, turnstileToken } = parsed.data

  const ts = await verifyTurnstile(turnstileToken)
  if (!ts) {
    return NextResponse.json({ error: 'Bot check failed. Please try again.' }, { status: 400 })
  }

  // Rate limit by IP and account
  const rl = await checkAndRecord('login', [`ip:${ip}`, `account_email:${email}`])
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many login attempts. Please wait and try again.' }, { status: 429 })
  }

  const user = await prisma.user.findUnique({ where: { email } })

  // Constant-time-ish: always hash even if user not found
  const hash = user?.passwordHash ?? '$2b$12$invalid.hash.to.prevent.timing.attacks.xxxxxxxxxx'
  const valid = await verifyPassword(password, hash)

  if (!user || !valid) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  if (user.suspendedAt) {
    return NextResponse.json({ error: 'Account suspended' }, { status: 403 })
  }

  // Send OTP - by text message when the user has enrolled a phone and an SMS
  // provider module is active, otherwise (and on any SMS failure) by email.
  // Both channels share the same challenge, so /api/auth/email-code verifies
  // either without knowing which one delivered it.
  const code = await createEmailChallenge(user.id, 'login_otp')
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { siteName: true },
  })
  const siteName = config?.siteName ?? 'Cactus'

  let channel: 'email' | 'sms' = 'email'
  let destination: string | undefined
  if (user.smsOtpPhoneEncrypted) {
    const provider = await getActiveSmsProvider()
    if (provider) {
      try {
        const phone = decryptSecret(user.smsOtpPhoneEncrypted)
        await sendLoginCodeSms(provider, phone, code, siteName)
        channel = 'sms'
        destination = maskPhone(phone)
      } catch (err) {
        console.error('[login] SMS delivery failed, falling back to email:', err)
      }
    }
  }
  if (channel === 'email') {
    await sendLoginOtp(user.email, code, siteName)
  }

  return NextResponse.json({ step: 'otp', userId: user.id, channel, destination })
}
