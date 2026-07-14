import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission, isAdmin, canActOnUser, assertProtectedUserWouldRemain } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'

const Patch = z.object({
  roleId: z.string().optional(),
  suspend: z.boolean().optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  const actor = await getSessionFromCookie()
  if (!actor) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(actor, 'users.manage')) return errorResponse('Forbidden', 403)

  const { id } = await params
  if (id === actor.id) return errorResponse('Cannot modify your own account from this page', 400)

  const target = await prisma.user.findUnique({ where: { id }, include: { role: true } })
  if (!target) return errorResponse('User not found', 404)

  // Only admins can act on admin-role users
  if (target.role.isProtected && !isAdmin(actor)) {
    return errorResponse('Only Admin users can manage other Admin accounts', 403)
  }

  const parsed = Patch.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input')

  const { roleId, suspend } = parsed.data

  // Vet the DESTINATION role, not just the current one. The isProtected check
  // above only asks "who is the target now?" - it says nothing about where
  // they're headed. Without this, a non-admin holding users.manage could promote
  // any account (a colleague's, or a sock puppet they control) straight into the
  // protected Admin role, and Admin short-circuits every permission check from
  // then on. Promotion is an admin-only act.
  if (roleId && roleId !== target.roleId) {
    const destRole = await prisma.role.findUnique({
      where: { id: roleId },
      select: { isProtected: true },
    })
    if (!destRole) return errorResponse('Role not found', 404)
    if (!canActOnUser(actor, destRole)) {
      return errorResponse('Only Admin users can grant the Admin role', 403)
    }
  }

  // If changing role away from admin, ensure at least one admin remains
  if (roleId && roleId !== target.roleId && target.role.isProtected) {
    try {
      await prisma.$transaction(async (tx) => {
        await assertProtectedUserWouldRemain(tx, id)
        await tx.user.update({ where: { id }, data: { roleId } })
      })
    } catch (err: unknown) {
      return errorResponse(err instanceof Error ? err.message : 'Role change blocked', 409)
    }
    return NextResponse.json({ ok: true })
  }

  const data: Record<string, unknown> = {}
  if (roleId) data.roleId = roleId
  if (suspend !== undefined) {
    data.suspendedAt = suspend ? new Date() : null
  }

  await prisma.user.update({ where: { id }, data })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const actor = await getSessionFromCookie()
  if (!actor) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(actor, 'users.manage')) return errorResponse('Forbidden', 403)

  const { id } = await params
  if (id === actor.id) return errorResponse('Use account settings to delete your own account', 400)

  const target = await prisma.user.findUnique({ where: { id }, include: { role: true } })
  if (!target) return errorResponse('User not found', 404)

  if (target.role.isProtected && !isAdmin(actor)) {
    return errorResponse('Only Admin users can delete other Admin accounts', 403)
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (target.role.isProtected) {
        await assertProtectedUserWouldRemain(tx, id)
      }
      // Reassign content to "deleted user" sentinel (null createdById)
      await tx.infoPage.updateMany({ where: { createdById: id }, data: { createdById: null } })
      await tx.media.updateMany({ where: { uploadedById: id }, data: { uploadedById: null } })
      await tx.user.delete({ where: { id } })
    })
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Deletion blocked', 409)
  }

  return NextResponse.json({ ok: true })
}
