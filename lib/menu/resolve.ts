import { prisma } from '@/lib/db/prisma'

export type PublicMenuItem = {
  id: string
  label: string
  href: string
  openInNewTab: boolean
  children?: PublicMenuItem[]
}

export async function resolveMainMenu(): Promise<PublicMenuItem[]> {
  try {
    const config = await prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { mainMenuId: true },
    })

    if (!config?.mainMenuId) return []

    const items = await prisma.menuItem.findMany({
      where: { menuId: config.mainMenuId },
      include: {
        page: { select: { slug: true, status: true, title: true } },
      },
      orderBy: { order: 'asc' },
    })

    function resolveItem(item: (typeof items)[number]): PublicMenuItem | null {
      let label: string
      let href: string

      if (item.type === 'PAGE') {
        if (!item.page || item.page.status !== 'published') return null
        label = item.label ?? item.page.title
        href = `/${item.page.slug}`
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

    // Build the nested structure: top-level items first, then attach children
    const topLevel = items.filter((i) => i.parentId === null)
    const result: PublicMenuItem[] = []

    for (const item of topLevel) {
      const resolved = resolveItem(item)
      if (!resolved) continue

      const childItems = items.filter((i) => i.parentId === item.id)
      const children: PublicMenuItem[] = []
      for (const child of childItems) {
        const resolvedChild = resolveItem(child)
        if (resolvedChild) children.push(resolvedChild)
      }

      if (children.length > 0) resolved.children = children
      result.push(resolved)
    }

    return result
  } catch {
    return []
  }
}
