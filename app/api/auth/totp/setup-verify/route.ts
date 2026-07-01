import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie, createSession, setSessionCookie } from '@/lib/auth/session'
import { verifyTotpCode } from '@/lib/auth/totp'
import { decryptSecret } from '@/lib/crypto/secrets'
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
  const isSetupWizard = Boolean(userId)
  if (!userId) {
    const sessionUser = await getSessionFromCookie()
    if (!sessionUser) {
      return errorResponse('Not authenticated', 401)
    }
    userId = sessionUser.id
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, totpSecretEncrypted: true, suspendedAt: true },
  })
  if (!user?.totpSecretEncrypted) {
    return errorResponse('No pending authenticator setup for this account', 400)
  }

  const secret = decryptSecret(user.totpSecretEncrypted)
  if (!verifyTotpCode(secret, parsed.data.code)) {
    return errorResponse('Invalid code', 400)
  }

  await prisma.user.update({ where: { id: user.id }, data: { totpVerifiedAt: new Date() } })

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
