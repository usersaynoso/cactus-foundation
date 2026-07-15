import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { getMenuEntityProvider } from '@/lib/modules/menu-entity-provider'

type Params = { params: Promise<{ id: string }> }

const Visibility = z.enum(['PUBLIC', 'AUTHENTICATED', 'GUEST', 'ADMIN']).default('PUBLIC')

const AddItemBody = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('PAGE'),
    pageId: z.string().min(1),
    label: z.string().max(100).optional().nullable(),
    parentId: z.string().optional().nullable(),
    visibility: Visibility,
  }),
  z.object({
    type: z.literal('EXTERNAL'),
    label: z.string().min(1).max(100),
    url: z.string().url(),
    openInNewTab: z.boolean().default(false),
    parentId: z.string().optional().nullable(),
    visibility: Visibility,
  }),
  z.object({
    type: z.literal('MODULE_ENTITY'),
    moduleId: z.string().min(1),
    entityKind: z.string().min(1),
    entityId: z.string().min(1),
    label: z.string().max(100).optional().nullable(),
    openInNewTab: z.boolean().default(false),
    parentId: z.string().optional().nullable(),
    visibility: Visibility,
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

  // Validate parent belongs to this menu
  if (parentId) {
    const parentItem = await prisma.menuItem.findUnique({
      where: { id: parentId },
      select: { menuId: true },
    })
    if (!parentItem || parentItem.menuId !== menuId) {
      return errorResponse('Invalid parent item', 400)
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

  // For MODULE_ENTITY: the provider is the source of truth for whether the entity exists
  let moduleEntityLabel: string | null = null
  if (parsed.data.type === 'MODULE_ENTITY') {
    const provider = getMenuEntityProvider(parsed.data.moduleId)
    if (!provider) return errorResponse('Unknown module', 400)
    const resolved = await provider.resolveEntity(parsed.data.entityKind, parsed.data.entityId)
    if (!resolved) return errorResponse('Entity not found', 404)
    moduleEntityLabel = resolved.label
  }

  // Compute next order within the same parentId scope
  const maxOrder = await prisma.menuItem.aggregate({
    where: { menuId, parentId: parentId ?? null },
    _max: { order: true },
  })
  const order = (maxOrder._max.order ?? -1) + 1

  const visibility = parsed.data.visibility
  const data =
    parsed.data.type === 'PAGE'
      ? {
          menuId,
          type: 'PAGE' as const,
          pageId: parsed.data.pageId,
          label: parsed.data.label ?? null,
          parentId: parentId ?? null,
          visibility,
          order,
        }
      : parsed.data.type === 'EXTERNAL'
      ? {
          menuId,
          type: 'EXTERNAL' as const,
          label: parsed.data.label,
          url: parsed.data.url,
          openInNewTab: parsed.data.openInNewTab,
          parentId: parentId ?? null,
          visibility,
          order,
        }
      : {
          menuId,
          type: 'MODULE_ENTITY' as const,
          moduleId: parsed.data.moduleId,
          entityKind: parsed.data.entityKind,
          entityId: parsed.data.entityId,
          label: parsed.data.label ?? moduleEntityLabel,
          openInNewTab: parsed.data.openInNewTab,
          parentId: parentId ?? null,
          visibility,
          order,
        }

  const item = await prisma.menuItem.create({ data })
  return NextResponse.json(item, { status: 201 })
}
