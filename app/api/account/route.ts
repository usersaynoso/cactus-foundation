import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie, clearSessionCookie } from '@/lib/auth/session'
import { assertProtectedUserWouldRemain } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'

// DELETE /api/account — self-service account deletion
export async function DELETE() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  try {
    await prisma.$transaction(async (tx) => {
      if (user.role.isProtected) {
        // Blocked if this would leave zero admins
        await assertProtectedUserWouldRemain(tx, user.id)
      }
      await tx.infoPage.updateMany({ where: { createdById: user.id }, data: { createdById: null } })
      await tx.media.updateMany({ where: { uploadedById: user.id }, data: { uploadedById: null } })
      // Null the userId on consent records (right to erasure) — rows themselves survive as proof-of-consent
      await tx.consentRecord.updateMany({ where: { userId: user.id }, data: { userId: null } })
      await tx.user.delete({ where: { id: user.id } })
    })
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Deletion failed', 409)
  }

  await clearSessionCookie()
  return NextResponse.json({ ok: true })
}
