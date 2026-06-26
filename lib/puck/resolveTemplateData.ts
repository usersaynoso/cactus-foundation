import type { Data } from '@puckeditor/core'
import { resolveMenu, resolveMainMenu } from '@/lib/menu/resolve'

type Context = {
  siteName: string
  logoUrl: string | null
  isLoggedIn: boolean
  adminPath: string
}

export async function resolveTemplateData(rawData: unknown, ctx: Context): Promise<Data> {
  const data = JSON.parse(JSON.stringify(rawData)) as Data
  const content = Array.isArray(data.content) ? data.content : []

  for (const block of content) {
    if (!block?.type || !block?.props) continue

    if (block.type === 'MenuBlock' && block.props.menuId) {
      try {
        block.props.resolvedItems = await resolveMenu(block.props.menuId)
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

  return data
}
