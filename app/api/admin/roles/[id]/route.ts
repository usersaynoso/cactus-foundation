import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'

type Params = { params: Promise<{ id: string }> }

export async function DELETE(request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'roles.manage')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const role = await prisma.role.findUnique({ where: { id } })
  if (!role) return errorResponse('Not found', 404)
  if (role.isProtected) return errorResponse('Cannot delete a protected role', 403)

  // Check no staff users or members currently hold this role
  const [userCount, memberCount] = await Promise.all([
    prisma.user.count({ where: { roleId: id } }),
    prisma.member.count({ where: { roleId: id } }),
  ])
  const count = userCount + memberCount
  if (count > 0) {
    return errorResponse(`Cannot delete role "${role.name}" — ${count} account(s) still have it assigned`, 409)
  }

  await prisma.role.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
