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

    type RawItem = (typeof items)[number]

    function resolveItem(item: RawItem): PublicMenuItem | null {
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
  } catch {
    return []
  }
}
