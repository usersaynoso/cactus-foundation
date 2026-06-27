import type { Data } from '@puckeditor/core'
import { resolveMenu, resolveMainMenu } from '@/lib/menu/resolve'

type Context = {
  siteName: string
  logoUrl: string | null
  isLoggedIn: boolean
  adminPath: string
}

async function resolveBlock(block: any, ctx: Context): Promise<void> {
  if (!block?.type || !block?.props) return

  if (block.type === 'MenuBlock') {
    try {
      block.props.resolvedItems = block.props.menuId
        ? await resolveMenu(block.props.menuId)
        : await resolveMainMenu()
    } catch { block.props.resolvedItems = [] }
  }

  if (block.type === 'SiteLogo') {
    block.props.logoUrl = ctx.logoUrl
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
    block.props.siteName = ctx.siteName
    try {
      block.props.resolvedItems = await resolveMainMenu()
    } catch { block.props.resolvedItems = [] }
  }
}

export async function resolveTemplateData(rawData: unknown, ctx: Context): Promise<Data> {
  const data = JSON.parse(JSON.stringify(rawData)) as Data
  const content = Array.isArray(data.content) ? data.content : []
  const zones = data.zones ?? {}

  const allBlocks = [
    ...content,
    ...Object.values(zones).flatMap(z => (Array.isArray(z) ? z : [])),
  ]

  await Promise.all(allBlocks.map(block => resolveBlock(block, ctx)))

  return data
}
