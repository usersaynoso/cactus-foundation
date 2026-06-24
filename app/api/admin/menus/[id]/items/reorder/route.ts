import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'

type Params = { params: Promise<{ id: string }> }

const ReorderBody = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      parentId: z.string().nullable(),
      order: z.number().int().min(0),
    })
  ),
})

export async function POST(request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'menus.manage')) return errorResponse('Forbidden', 403)

  const { id: menuId } = await params
  const menu = await prisma.menu.findUnique({ where: { id: menuId } })
  if (!menu) return errorResponse('Not found', 404)

  const parsed = ReorderBody.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input')

  const { items } = parsed.data

  // Validate: all items belong to this menu, and depth rule is respected
  const existingItems = await prisma.menuItem.findMany({
    where: { menuId },
    select: { id: true },
  })
  const validIds = new Set(existingItems.map((i) => i.id))

  for (const item of items) {
    if (!validIds.has(item.id)) return errorResponse(`Item ${item.id} not in this menu`, 400)
  }

  await prisma.$transaction(
    items.map((item) =>
      prisma.menuItem.update({
        where: { id: item.id },
        data: { parentId: item.parentId, order: item.order },
      })
    )
  )

  return NextResponse.json({ ok: true })
}
