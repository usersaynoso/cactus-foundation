import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'

type Params = { params: Promise<{ id: string }> }

// Clone a menu and its entire item tree into a brand-new menu. Because the copy
// lands in a fresh menu, the @@unique([menuId, pageId]) constraint can't bite -
// each page still appears at most once within the new menu, just as it did in the
// source. Items are recreated parents-first so every child's parentId already
// points at a real (freshly minted) row.
export async function POST(request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'menus.manage')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const source = await prisma.menu.findUnique({
    where: { id },
    include: { items: { orderBy: { order: 'asc' } } },
  })
  if (!source) return errorResponse('Not found', 404)

  // Captured into locals so the narrowing survives into the nested closure below
  // (TS control-flow narrowing doesn't carry across function boundaries).
  const sourceName = source.name
  const sourceItems = source.items

  const created = await prisma.$transaction(async (tx) => {
    const newMenu = await tx.menu.create({ data: { name: `${sourceName} (copy)` } })

    // Walk the tree parents-first, remapping old ids to new ones as we go.
    async function cloneChildrenOf(oldParentId: string | null, newParentId: string | null): Promise<void> {
      const layer = sourceItems.filter((i) => i.parentId === oldParentId)
      for (const item of layer) {
        const clone = await tx.menuItem.create({
          data: {
            menuId: newMenu.id,
            parentId: newParentId,
            type: item.type,
            pageId: item.pageId,
            label: item.label,
            url: item.url,
            moduleId: item.moduleId,
            entityKind: item.entityKind,
            entityId: item.entityId,
            openInNewTab: item.openInNewTab,
            visibility: item.visibility,
            order: item.order,
          },
        })
        await cloneChildrenOf(item.id, clone.id)
      }
    }

    await cloneChildrenOf(null, null)
    return newMenu
  }, { timeout: 15000 })

  return NextResponse.json(created, { status: 201 })
}
