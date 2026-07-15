import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { getMenuEntityProvider } from '@/lib/modules/menu-entity-provider'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'menus.manage')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const menu = await prisma.menu.findUnique({
    where: { id },
    include: {
      items: {
        include: { page: { select: { id: true, title: true, slug: true, status: true } } },
        orderBy: { order: 'asc' },
      },
    },
  })
  if (!menu) return errorResponse('Not found', 404)

  // Resolve each MODULE_ENTITY item's current label/href for display (item
  // itself only stores moduleId/entityKind/entityId - no FK into module tables).
  const items = await Promise.all(
    menu.items.map(async (item) => {
      if (item.type !== 'MODULE_ENTITY' || !item.moduleId || !item.entityKind || !item.entityId) {
        return { ...item, moduleEntity: null }
      }
      const provider = getMenuEntityProvider(item.moduleId)
      const resolved = provider ? await provider.resolveEntity(item.entityKind, item.entityId) : null
      return {
        ...item,
        moduleEntity: resolved
          ? { moduleLabel: provider!.moduleLabel, ...resolved }
          : null,
      }
    })
  )

  const config = await prisma.siteConfig.findUnique({ where: { id: 'singleton' }, select: { mainMenuId: true } })

  return NextResponse.json({ ...menu, items, isMainMenu: config?.mainMenuId === id })
}

const PatchBody = z.object({
  name: z.string().min(1).max(100).optional(),
  // Set this menu as the site's main menu (true) or, when it currently is the
  // main menu, unset it (false). Lets an admin promote a menu from the menus
  // list itself instead of hunting through Settings > General.
  isMainMenu: z.boolean().optional(),
})

export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'menus.manage')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const menu = await prisma.menu.findUnique({ where: { id } })
  if (!menu) return errorResponse('Not found', 404)

  const parsed = PatchBody.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input')

  const { name, isMainMenu } = parsed.data

  if (name !== undefined) {
    await prisma.menu.update({ where: { id }, data: { name } })
  }

  if (isMainMenu !== undefined) {
    const config = await prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { mainMenuId: true },
    })
    if (isMainMenu) {
      await prisma.siteConfig.update({ where: { id: 'singleton' }, data: { mainMenuId: id } })
    } else if (config?.mainMenuId === id) {
      // Only clear it if this menu is the one currently assigned - never yank a
      // different menu out of the header by accident.
      await prisma.siteConfig.update({ where: { id: 'singleton' }, data: { mainMenuId: null } })
    }
  }

  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { mainMenuId: true },
  })
  const refreshed = await prisma.menu.findUnique({ where: { id } })
  return NextResponse.json({ ...refreshed, isMainMenu: config?.mainMenuId === id })
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'menus.manage')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const menu = await prisma.menu.findUnique({ where: { id } })
  if (!menu) return errorResponse('Not found', 404)

  // Check if this menu is the main menu
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { mainMenuId: true },
  })
  const isMainMenu = config?.mainMenuId === id

  await prisma.$transaction(async (tx) => {
    // Clear mainMenuId if this is the main menu
    if (isMainMenu) {
      await tx.siteConfig.update({
        where: { id: 'singleton' },
        data: { mainMenuId: null },
      })
    }
    await tx.menu.delete({ where: { id } })
  })

  return NextResponse.json({ ok: true, wasMainMenu: isMainMenu })
}
