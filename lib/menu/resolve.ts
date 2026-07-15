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

// Who is looking at the menu, as far as per-item visibility is concerned. Worked
// out once per request by the caller (see app/(public)/layout.tsx) and threaded
// through, so the same viewer is shared across every menu on the page.
export type MenuViewer = {
  // Any signed-in visitor: a member OR an admin.
  isAuthenticated: boolean
  // An admin-panel (staff) session specifically.
  isAdmin: boolean
}

// The default when no viewer is supplied (status pages, previews): treat the
// reader as an anonymous public visitor, so only PUBLIC items surface. A stable
// module-level constant, not a fresh object per call, so it never fragments the
// cache() memo below.
const ANON_VIEWER: MenuViewer = { isAuthenticated: false, isAdmin: false }

// Whether an item's visibility setting lets this viewer see it. Unknown values
// fall back to "shown" - a menu item quietly vanishing is worse than one that
// leaks to a slightly wider audience than intended.
function itemVisibleTo(visibility: string, viewer: MenuViewer): boolean {
  switch (visibility) {
    case 'AUTHENTICATED': return viewer.isAuthenticated
    case 'GUEST': return !viewer.isAuthenticated
    case 'ADMIN': return viewer.isAdmin
    case 'PUBLIC':
    default: return true
  }
}

// Both resolvers are wrapped in React cache(): a single page render asks for the
// same menu once per MenuBlock and again for the SiteHeader block, across the
// header and footer template passes, so without this the identical menu is read
// from the database two to four times per request. The resolved tree is only ever
// read by the blocks it is handed to, never mutated, so sharing one instance is safe.
// The viewer is part of the cache key, which is fine: it's constant within a
// request, so the dedup still lands.
export const resolveMenu = cache(async (menuId: string, viewer: MenuViewer = ANON_VIEWER): Promise<PublicMenuItem[]> => {
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

    // Audience gate first: an item this viewer can't see is dropped along with
    // its whole subtree (buildTree never recurses into a skipped item), which is
    // the right nav behaviour - a hidden parent shouldn't leave orphaned children.
    if (!itemVisibleTo(item.visibility, viewer)) return null

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

export const resolveMainMenu = cache(async (viewer: MenuViewer = ANON_VIEWER): Promise<PublicMenuItem[]> => {
  try {
    const config = await prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { mainMenuId: true },
    })

    if (!config?.mainMenuId) return []

    return await resolveMenu(config.mainMenuId, viewer)
  } catch {
    return []
  }
})
