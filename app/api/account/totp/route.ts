import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { errorResponse, successResponse } from '@/lib/utils'

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { totpVerifiedAt: true },
  })

  return successResponse({ enabled: Boolean(dbUser?.totpVerifiedAt) })
}

export async function DELETE() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true, _count: { select: { passkeys: true } } },
  })

  // TOTP is a primary auth factor, same standing as a passkey — block removal
  // if it's the account's only remaining way to sign in.
  if (dbUser && !dbUser.passwordHash && dbUser._count.passkeys === 0) {
    return errorResponse('Cannot remove your only sign-in method without a password or passkey set — you would be locked out.', 400)
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecretEncrypted: null, totpVerifiedAt: null },
  })

  return successResponse({ ok: true })
}
