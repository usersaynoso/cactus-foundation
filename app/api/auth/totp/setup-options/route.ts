import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { generateTotpSecret, buildOtpauthUri, generateQrDataUrl } from '@/lib/auth/totp'
import { encryptSecret } from '@/lib/crypto/secrets'
import { errorResponse, successResponse } from '@/lib/utils'

const Body = z.object({
  userId: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return errorResponse('Invalid input', 400)
  }

  let userId = parsed.data.userId ?? null
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
  } else {
    const sessionUser = await getSessionFromCookie()
    if (!sessionUser) {
      return errorResponse('Not authenticated', 401)
    }
    userId = sessionUser.id
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } })
  if (!user) {
    return errorResponse('User not found', 404)
  }

  const secret = generateTotpSecret()
  const uri = buildOtpauthUri(secret, user.email)
  const qrDataUrl = await generateQrDataUrl(uri)

  // Stored unverified — totpVerifiedAt only gets set once setup-verify confirms
  // the admin's authenticator app produces a matching code.
  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecretEncrypted: encryptSecret(secret), totpVerifiedAt: null, totpLastStep: null },
  })

  return successResponse({ qrDataUrl, secret, otpauthUri: uri })
}
