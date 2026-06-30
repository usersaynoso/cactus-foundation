import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'

type Params = { params: Promise<{ id: string }> }

const PatchBody = z.object({
  read: z.boolean(),
})

export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'config.manage')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const notification = await prisma.notification.findUnique({ where: { id } })
  if (!notification) return errorResponse('Notification not found', 404)

  const parsed = PatchBody.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input')

  const { read } = parsed.data

  await prisma.notification.update({
    where: { id },
    data: { readAt: read ? new Date() : null },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'config.manage')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const notification = await prisma.notification.findUnique({ where: { id } })
  if (!notification) return errorResponse('Notification not found', 404)

  await prisma.notification.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
