import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { errorResponse } from '@/lib/utils'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  const { id } = await params

  const passkey = await prisma.passkey.findUnique({ where: { id } })
  if (!passkey || passkey.userId !== user.id) {
    return errorResponse('Not found', 404)
  }

  const remainingPasskeys = await prisma.passkey.count({
    where: { userId: user.id, NOT: { id } },
  })

  if (remainingPasskeys === 0) {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    })
    if (!dbUser?.passwordHash) {
      return errorResponse('Cannot remove your only passkey without a password set — you would be locked out.', 400)
    }
  }

  await prisma.passkey.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
