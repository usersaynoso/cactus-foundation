import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'

type Params = { params: Promise<{ id: string; itemId: string }> }

const PatchBody = z.object({
  label: z.string().max(100).optional().nullable(),
  url: z.string().url().optional().nullable(),
  openInNewTab: z.boolean().optional(),
})

export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'menus.manage')) return errorResponse('Forbidden', 403)

  const { id: menuId, itemId } = await params
  const item = await prisma.menuItem.findUnique({ where: { id: itemId } })
  if (!item || item.menuId !== menuId) return errorResponse('Not found', 404)

  const parsed = PatchBody.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input')

  // url only valid for EXTERNAL items
  if (parsed.data.url !== undefined && item.type !== 'EXTERNAL') {
    return errorResponse('URL can only be set on external items', 400)
  }

  const updated = await prisma.menuItem.update({
    where: { id: itemId },
    data: {
      ...(parsed.data.label !== undefined ? { label: parsed.data.label } : {}),
      ...(parsed.data.url !== undefined ? { url: parsed.data.url } : {}),
      ...(parsed.data.openInNewTab !== undefined ? { openInNewTab: parsed.data.openInNewTab } : {}),
    },
  })
  return NextResponse.json(updated)
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'menus.manage')) return errorResponse('Forbidden', 403)

  const { id: menuId, itemId } = await params
  const item = await prisma.menuItem.findUnique({ where: { id: itemId } })
  if (!item || item.menuId !== menuId) return errorResponse('Not found', 404)

  await prisma.menuItem.delete({ where: { id: itemId } })
  return NextResponse.json({ ok: true })
}
