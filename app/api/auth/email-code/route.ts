// Verify the OTP sent during password login, then create the session.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { verifyEmailChallenge } from '@/lib/auth/email-challenge'
import { createSession, setSessionCookie, createTrustedDevice, setTrustedDeviceCookie, isTrustedDevice } from '@/lib/auth/session'
import { checkAndRecord, getClientIp } from '@/lib/auth/rate-limit'

const Body = z.object({
  userId: z.string(),
  code: z.string().length(6),
  trustDevice: z.boolean().default(false),
})

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const { userId, code, trustDevice } = parsed.data

  // Rate-limit on both the caller's IP and the target account, matching the
  // sibling flows (member_login, member_2fa). IP-only lets an attacker spread
  // guesses against one account across many IPs.
  const ip = await getClientIp(request)
  const rl = await checkAndRecord('email_code', [`ip:${ip}`, `account:${userId}`])
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many attempts. Please wait.' }, { status: 429 })
  }

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  // Check if device is already trusted — skip OTP if so
  const trusted = await isTrustedDevice(userId)

  let verified = trusted
  if (!trusted) {
    const result = await verifyEmailChallenge(userId, 'login_otp', code)
    if (!result.success) {
      const message =
        result.reason === 'max_attempts' ? 'Too many incorrect attempts. Please log in again.' :
        result.reason === 'expired' ? 'Code has expired. Please log in again.' :
        'Incorrect code'
      return NextResponse.json({ error: message }, { status: 401 })
    }
    verified = true
  }

  if (!verified) return NextResponse.json({ error: 'Verification failed' }, { status: 401 })

  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { trustDeviceDays: true },
  })
  const days = config?.trustDeviceDays ?? 28

  const token = await createSession(userId)
  await setSessionCookie(token)

  if (trustDevice && !trusted) {
    const deviceToken = await createTrustedDevice(userId, days)
    await setTrustedDeviceCookie(deviceToken, days)
  }

  return NextResponse.json({ ok: true })
}
