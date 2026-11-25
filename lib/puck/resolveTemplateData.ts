import type { Data } from '@puckeditor/core'
import { resolveMenu, resolveMainMenu, type MenuViewer } from '@/lib/menu/resolve'
import { getMemberAreaPath } from '@/lib/members/paths'
import type { MobileBarMenuItem } from '@/lib/puck/mobileBar'

export type TemplateContext = {
  siteName: string
  logoUrl: string | null
  logoDarkUrl: string | null
  isLoggedIn: boolean
  adminPath: string
  // Who's viewing, for per-item menu visibility. Optional so the status/preview
  // callers that don't compute it fall back to an anonymous public reader.
  viewer?: MenuViewer
}

async function resolveBlock(block: any, ctx: TemplateContext): Promise<void> {
  if (!block?.type || !block?.props) return

  if (block.type === 'MenuBlock') {
    try {
      block.props.resolvedItems = block.props.menuId
        ? await resolveMenu(block.props.menuId, ctx.viewer)
        : await resolveMainMenu(ctx.viewer)
    } catch { block.props.resolvedItems = [] }
  }

  // The Mobile Bar carries several menus at once - one per Menu cell - so it
  // gets an array parallel to its own items rather than the single resolvedItems
  // the Menu block takes. Index is the join: the bar walks the same array in the
  // same order when it renders.
  //
  // The account cell's destination is settled here too, for the same reason the
  // menus are: only the server knows whether this visitor is signed in, and
  // sending a signed-in member to the sign-in page is a small betrayal.
  if (block.type === 'MobileBar') {
    const items: { kind?: string; menuId?: string }[] = Array.isArray(block.props.items) ? block.props.items : []
    const memberBase = `/${getMemberAreaPath()}`
    block.props.accountHref = ctx.viewer?.isAuthenticated ? memberBase : `${memberBase}/login`
    // Declared, not inferred: this is the one place the resolver's shape meets
    // the panel's, so it is the one place that can be made to fail loudly if
    // they ever drift apart again. See MobileBarMenuItem.
    const menus: MobileBarMenuItem[][] = await Promise.all(items.map(async (item) => {
      if (item?.kind !== 'menu') return []
      try {
        return item.menuId ? await resolveMenu(item.menuId, ctx.viewer) : await resolveMainMenu(ctx.viewer)
      } catch { return [] }
    }))
    block.props.resolvedMenus = menus
  }

  if (block.type === 'SiteLogo') {
    block.props.logoUrl = ctx.logoUrl
    block.props.logoUrlDark = ctx.logoDarkUrl
    block.props.siteName = ctx.siteName
  }

  if (block.type === 'Copyright') {
    block.props.siteName = ctx.siteName
    block.props.year = new Date().getFullYear()
  }

  if (block.type === 'LoginButton') {
    block.props.isLoggedIn = ctx.isLoggedIn
    block.props.adminPath = ctx.adminPath
  }

  if (block.type === 'SiteHeader') {
    block.props.logoUrl = ctx.logoUrl
    block.props.logoUrlDark = ctx.logoDarkUrl
    block.props.siteName = ctx.siteName
    try {
      block.props.resolvedItems = await resolveMainMenu(ctx.viewer)
    } catch { block.props.resolvedItems = [] }
  }
}

// The block types resolveBlock fills in. Anything else passes through untouched.
const TEMPLATE_BLOCK_TYPES: ReadonlySet<string> = new Set(['MenuBlock', 'MobileBar', 'SiteLogo', 'Copyright', 'LoginButton', 'SiteHeader'])

/**
 * Whether a Puck data tree holds any block resolveTemplateData has something to
 * fill in. Lets a render path whose data usually holds none (a page's own
 * content, a page layout) skip the deep copy and the context lookups entirely.
 * Walks every nested value rather than only content, zones and slot arrays, so
 * it can only err towards resolving.
 */
export function needsTemplateData(tree: unknown): boolean {
  const stack: unknown[] = [tree]
  while (stack.length > 0) {
    const node = stack.pop()
    if (!node || typeof node !== 'object') continue
    if (Array.isArray(node)) {
      for (const v of node) stack.push(v)
      continue
    }
    const record = node as Record<string, unknown>
    if (typeof record.type === 'string' && TEMPLATE_BLOCK_TYPES.has(record.type)) return true
    for (const v of Object.values(record)) stack.push(v)
  }
  return false
}

function collectBlocks(blocks: any[]): any[] {
  return blocks.flatMap(block => {
    if (!block?.props) return [block]
    const nested = Object.values(block.props).flatMap(v =>
      Array.isArray(v) ? collectBlocks(v as any[]) : []
    )
    return [block, ...nested]
  })
}

export async function resolveTemplateData(rawData: unknown, ctx: TemplateContext): Promise<Data> {
  const data = JSON.parse(JSON.stringify(rawData)) as Data
  const content = Array.isArray(data.content) ? data.content : []
  const zones = data.zones ?? {}

  const allBlocks = [
    ...collectBlocks(content),
    ...Object.values(zones).flatMap(z => (Array.isArray(z) ? collectBlocks(z) : [])),
  ]

  await Promise.all(allBlocks.map(block => resolveBlock(block, ctx)))

  return data
}
