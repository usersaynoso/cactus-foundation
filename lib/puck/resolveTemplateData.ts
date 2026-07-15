import type { Data } from '@puckeditor/core'
import { resolveMenu, resolveMainMenu, type MenuViewer } from '@/lib/menu/resolve'

type Context = {
  siteName: string
  logoUrl: string | null
  logoDarkUrl: string | null
  isLoggedIn: boolean
  adminPath: string
  // Who's viewing, for per-item menu visibility. Optional so the status/preview
  // callers that don't compute it fall back to an anonymous public reader.
  viewer?: MenuViewer
}

async function resolveBlock(block: any, ctx: Context): Promise<void> {
  if (!block?.type || !block?.props) return

  if (block.type === 'MenuBlock') {
    try {
      block.props.resolvedItems = block.props.menuId
        ? await resolveMenu(block.props.menuId, ctx.viewer)
        : await resolveMainMenu(ctx.viewer)
    } catch { block.props.resolvedItems = [] }
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

function collectBlocks(blocks: any[]): any[] {
  return blocks.flatMap(block => {
    if (!block?.props) return [block]
    const nested = Object.values(block.props).flatMap(v =>
      Array.isArray(v) ? collectBlocks(v as any[]) : []
    )
    return [block, ...nested]
  })
}

export async function resolveTemplateData(rawData: unknown, ctx: Context): Promise<Data> {
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
