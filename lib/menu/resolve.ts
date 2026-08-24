import { cache } from 'react'
import { prisma } from '@/lib/db/prisma'
import { getSiteConfig } from '@/lib/config/site'
import { getMenuEntityProvider, type ResolvedMenuEntity } from '@/lib/modules/menu-entity-provider'

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

  // Every module-entity item's target, resolved up front in one batch per
  // (module, kind) pair. This used to happen inside the tree walk below, which
  // is recursive and sequential: each item awaited its own query, and the next
  // item could not start until it finished. A header with seven category links
  // therefore cost seven serial round trips on every page render, and the menu
  // is on every page. Resolved here, it is one query per kind - and the walk
  // that follows touches the database not at all.
  const entities = await resolveMenuEntities(items, viewer)

  function resolveItem(item: RawItem): PublicMenuItem | null {
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
      const resolved = entities.get(entityCacheKey(item.moduleId, item.entityKind, item.entityId))
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

  function buildTree(parentId: string | null): PublicMenuItem[] {
    const children = items.filter((i) => i.parentId === parentId)
    const result: PublicMenuItem[] = []
    for (const item of children) {
      const resolved = resolveItem(item)
      if (!resolved) continue
      const nestedChildren = buildTree(item.id)
      if (nestedChildren.length > 0) resolved.children = nestedChildren
      result.push(resolved)
    }
    return result
  }

  return buildTree(null)
})

function entityCacheKey(moduleId: string, kind: string, id: string): string {
  return `${moduleId}\u0000${kind}\u0000${id}`
}

/**
 * Resolve every module-entity target in one menu, batched per (module, kind).
 *
 * Only items this viewer could actually see are looked up: an item the audience
 * gate is about to drop is not worth a query, and the gate is a pure function of
 * data already in hand. Items whose subtree will be dropped with their parent
 * are still resolved - working that out would mean walking the tree twice, and
 * the saving is a handful of ids at most.
 *
 * A provider that offers `resolveEntities` answers a whole kind at once. One
 * that does not is called per id but concurrently, so the round trips overlap
 * even though there are still several of them. Either way nothing here is
 * sequential, which was the actual cost.
 */
async function resolveMenuEntities(
  items: { type: string; visibility: string; moduleId: string | null; entityKind: string | null; entityId: string | null }[],
  viewer: MenuViewer,
): Promise<Map<string, ResolvedMenuEntity>> {
  const out = new Map<string, ResolvedMenuEntity>()

  // (moduleId, kind) -> the ids that pair needs
  const wanted = new Map<string, { moduleId: string; kind: string; ids: Set<string> }>()
  for (const item of items) {
    if (item.type !== 'MODULE_ENTITY') continue
    if (!item.moduleId || !item.entityKind || !item.entityId) continue
    if (!itemVisibleTo(item.visibility, viewer)) continue
    const key = `${item.moduleId}\u0000${item.entityKind}`
    const group = wanted.get(key) ?? { moduleId: item.moduleId, kind: item.entityKind, ids: new Set<string>() }
    group.ids.add(item.entityId)
    wanted.set(key, group)
  }
  if (wanted.size === 0) return out

  await Promise.all(
    [...wanted.values()].map(async ({ moduleId, kind, ids }) => {
      const provider = getMenuEntityProvider(moduleId)
      if (!provider) return
      const idList = [...ids]
      try {
        if (provider.resolveEntities) {
          const resolved = await provider.resolveEntities(kind, idList)
          for (const [id, entity] of resolved) out.set(entityCacheKey(moduleId, kind, id), entity)
          return
        }
        const resolved = await Promise.all(idList.map((id) => provider.resolveEntity(kind, id)))
        idList.forEach((id, i) => {
          const entity = resolved[i]
          if (entity) out.set(entityCacheKey(moduleId, kind, id), entity)
        })
      } catch {
        // A provider that falls over loses its own items from the menu, which is
        // what a null answer already meant. It must not take the whole nav with
        // it - the header is on every page, including the ones an admin would
        // use to fix whatever broke.
      }
    }),
  )
  return out
}

export const resolveMainMenu = cache(async (viewer: MenuViewer = ANON_VIEWER): Promise<PublicMenuItem[]> => {
  try {
    // Shared cache()d read, not a narrow select of its own - see
    // lib/config/branding.ts for why every SiteConfig reader on the render path
    // now asks for the same shape.
    const config = await getSiteConfig()

    if (!config?.mainMenuId) return []

    return await resolveMenu(config.mainMenuId, viewer)
  } catch {
    return []
  }
})
