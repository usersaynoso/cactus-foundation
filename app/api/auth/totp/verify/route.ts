import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { createSession, setSessionCookie } from '@/lib/auth/session'
import { verifyTotpCode } from '@/lib/auth/totp'
import { decryptSecret } from '@/lib/crypto/secrets'
import { checkAndRecord, getClientIp } from '@/lib/auth/rate-limit'
import { errorResponse, successResponse } from '@/lib/utils'

const Body = z.object({
  email: z.string().email(),
  code: z.string().min(6).max(6),
})

const GENERIC_ERROR = 'Invalid or expired code'

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return errorResponse('Invalid input', 400)
  }
  const { email, code } = parsed.data

  const ip = await getClientIp(request)
  const rl = await checkAndRecord('totp_verify', [`ip:${ip}`, `account_email:${email}`])
  if (!rl.allowed) {
    return errorResponse('Too many attempts. Please wait and try again.', 429)
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, totpSecretEncrypted: true, totpVerifiedAt: true, suspendedAt: true },
  })

  // Same generic error whether the account exists, has no TOTP configured, or
  // the code is simply wrong — avoids leaking account-enumeration signal.
  if (!user?.totpSecretEncrypted || !user.totpVerifiedAt) {
    return errorResponse(GENERIC_ERROR, 401)
  }

  const secret = decryptSecret(user.totpSecretEncrypted)
  if (!verifyTotpCode(secret, code)) {
    return errorResponse(GENERIC_ERROR, 401)
  }

  if (user.suspendedAt) {
    return errorResponse('Account suspended', 403)
  }

  const token = await createSession(user.id)
  await setSessionCookie(token)

  return successResponse({ verified: true, userId: user.id })
}
