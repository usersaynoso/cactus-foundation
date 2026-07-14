import { cache } from 'react'
import { prisma } from '@/lib/db/prisma'
import { getMenuEntityProvider } from '@/lib/modules/menu-entity-provider'

export type PublicMenuItem = {
  id: string
  label: string
  href: string
  openInNewTab: boolean
  children?: PublicMenuItem[]
}

// Both resolvers are wrapped in React cache(): a single page render asks for the
// same menu once per MenuBlock and again for the SiteHeader block, across the
// header and footer template passes, so without this the identical menu is read
// from the database two to four times per request. The resolved tree is only ever
// read by the blocks it is handed to, never mutated, so sharing one instance is safe.
export const resolveMenu = cache(async (menuId: string): Promise<PublicMenuItem[]> => {
  if (!menuId) return []

  const items = await prisma.menuItem.findMany({
    where: { menuId },
    include: {
      page: { select: { slug: true, status: true, title: true } },
    },
    orderBy: { order: 'asc' },
  })

  type RawItem = (typeof items)[number]

  async function resolveItem(item: RawItem): Promise<PublicMenuItem | null> {
    let label: string
    let href: string

    if (item.type === 'PAGE') {
      if (!item.page || item.page.status !== 'published') return null
      label = item.label ?? item.page.title
      href = `/${item.page.slug}`
    } else if (item.type === 'MODULE_ENTITY') {
      if (!item.moduleId || !item.entityKind || !item.entityId) return null
      const provider = getMenuEntityProvider(item.moduleId)
      if (!provider) return null
      const resolved = await provider.resolveEntity(item.entityKind, item.entityId)
      if (!resolved || !resolved.publiclyVisible) return null
      label = item.label ?? resolved.label
      href = resolved.href
    } else {
      label = item.label ?? ''
      href = item.url ?? '#'
    }

    return {
      id: item.id,
      label,
      href,
      openInNewTab: item.openInNewTab,
    }
  }

  async function buildTree(parentId: string | null): Promise<PublicMenuItem[]> {
    const children = items.filter((i) => i.parentId === parentId)
    const result: PublicMenuItem[] = []
    for (const item of children) {
      const resolved = await resolveItem(item)
      if (!resolved) continue
      const nestedChildren = await buildTree(item.id)
      if (nestedChildren.length > 0) resolved.children = nestedChildren
      result.push(resolved)
    }
    return result
  }

  return buildTree(null)
})

export const resolveMainMenu = cache(async (): Promise<PublicMenuItem[]> => {
  try {
    const config = await prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { mainMenuId: true },
    })

    if (!config?.mainMenuId) return []

    return await resolveMenu(config.mainMenuId)
  } catch {
    return []
  }
})
