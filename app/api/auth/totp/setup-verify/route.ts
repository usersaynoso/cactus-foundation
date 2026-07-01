import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie, createSession, setSessionCookie } from '@/lib/auth/session'
import { verifyTotpCode } from '@/lib/auth/totp'
import { decryptSecret } from '@/lib/crypto/secrets'
import { checkAndRecord, getClientIp } from '@/lib/auth/rate-limit'
import { errorResponse, successResponse } from '@/lib/utils'

const Body = z.object({
  userId: z.string().optional(),
  code: z.string().min(6).max(6),
})

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return errorResponse('Invalid input', 400)
  }

  let userId = parsed.data.userId ?? null
  let isSetupWizard = false
  if (userId) {
    // Client-supplied userId only trusted during the first-run setup wizard,
    // before any user/session exists to prove identity.
    const [cfg, existingUserCount] = await Promise.all([
      prisma.siteConfig.findUnique({ where: { id: 'singleton' }, select: { setupCompleted: true } }),
      prisma.user.count(),
    ])
    if (cfg?.setupCompleted && existingUserCount > 0) {
      return errorResponse('Setup is already complete', 403)
    }
    isSetupWizard = true
  } else {
    const sessionUser = await getSessionFromCookie()
    if (!sessionUser) {
      return errorResponse('Not authenticated', 401)
    }
    userId = sessionUser.id
  }

  const ip = await getClientIp(request)
  const rl = await checkAndRecord('totp_verify', [`ip:${ip}`, `account:${userId}`])
  if (!rl.allowed) {
    return errorResponse('Too many attempts. Please wait and try again.', 429)
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, totpSecretEncrypted: true, totpLastStep: true, suspendedAt: true },
  })
  if (!user?.totpSecretEncrypted) {
    return errorResponse('No pending authenticator setup for this account', 400)
  }

  const secret = decryptSecret(user.totpSecretEncrypted)
  const result = verifyTotpCode(secret, parsed.data.code, user.totpLastStep)
  if (!result.valid) {
    return errorResponse('Invalid code', 400)
  }

  await prisma.user.update({ where: { id: user.id }, data: { totpVerifiedAt: new Date(), totpLastStep: result.step } })

  // Setup-wizard mode has no session yet — create one now, mirroring
  // passkey/register-verify's behaviour during initial admin creation.
  if (isSetupWizard) {
    if (user.suspendedAt) {
      return errorResponse('Account suspended', 403)
    }
    const token = await createSession(user.id)
    await setSessionCookie(token)
  }

  return successResponse({ verified: true, userId: user.id })
}
