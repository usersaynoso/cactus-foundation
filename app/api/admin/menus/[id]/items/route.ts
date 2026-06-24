import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'

type Params = { params: Promise<{ id: string }> }

const AddItemBody = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('PAGE'),
    pageId: z.string().min(1),
    label: z.string().max(100).optional().nullable(),
    parentId: z.string().optional().nullable(),
  }),
  z.object({
    type: z.literal('EXTERNAL'),
    label: z.string().min(1).max(100),
    url: z.string().url(),
    openInNewTab: z.boolean().default(false),
    parentId: z.string().optional().nullable(),
  }),
])

export async function POST(request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'menus.manage')) return errorResponse('Forbidden', 403)

  const { id: menuId } = await params
  const menu = await prisma.menu.findUnique({ where: { id: menuId } })
  if (!menu) return errorResponse('Not found', 404)

  const parsed = AddItemBody.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input')

  const { parentId } = parsed.data

  // Nesting depth check: parentId must not itself have a parentId
  if (parentId) {
    const parentItem = await prisma.menuItem.findUnique({
      where: { id: parentId },
      select: { parentId: true, menuId: true },
    })
    if (!parentItem || parentItem.menuId !== menuId) {
      return errorResponse('Invalid parent item', 400)
    }
    if (parentItem.parentId !== null) {
      return errorResponse('Nesting is capped at one level', 400)
    }
  }

  // For PAGE type: check the page exists and isn't already in this menu
  if (parsed.data.type === 'PAGE') {
    const page = await prisma.infoPage.findUnique({ where: { id: parsed.data.pageId } })
    if (!page) return errorResponse('Page not found', 404)

    const existing = await prisma.menuItem.findUnique({
      where: { menuId_pageId: { menuId, pageId: parsed.data.pageId } },
    })
    if (existing) return errorResponse('This page is already in this menu', 409)
  }

  // Compute next order within the same parentId scope
  const maxOrder = await prisma.menuItem.aggregate({
    where: { menuId, parentId: parentId ?? null },
    _max: { order: true },
  })
  const order = (maxOrder._max.order ?? -1) + 1

  const data =
    parsed.data.type === 'PAGE'
      ? {
          menuId,
          type: 'PAGE' as const,
          pageId: parsed.data.pageId,
          label: parsed.data.label ?? null,
          parentId: parentId ?? null,
          order,
        }
      : {
          menuId,
          type: 'EXTERNAL' as const,
          label: parsed.data.label,
          url: parsed.data.url,
          openInNewTab: parsed.data.openInNewTab,
          parentId: parentId ?? null,
          order,
        }

  const item = await prisma.menuItem.create({ data })
  return NextResponse.json(item, { status: 201 })
}
