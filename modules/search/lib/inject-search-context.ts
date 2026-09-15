import type { PuckData } from './types'

// The 'searchResults' layout is one shared template rendered for every query -
// its blocks have no per-request q of their own. The /search page injects the
// request's query params into these block types' props right before rendering,
// mirroring gazette's inject-entry-context.ts.
const SEARCH_CONTEXT_BLOCKS = new Set(['SiteSearch', 'SiteSearchResults'])

export type SearchContext = {
  searchQuery: string
  searchPageNum: number
  searchSort: string
  searchSourcesParam: string
}

function injectBlocks(blocks: unknown[], ctx: SearchContext): void {
  for (const item of blocks) {
    if (!item || typeof item !== 'object') continue
    const block = item as { type?: string; props?: Record<string, unknown> }
    if (block.type && SEARCH_CONTEXT_BLOCKS.has(block.type) && block.props) {
      block.props.searchQuery = ctx.searchQuery
      block.props.searchPageNum = ctx.searchPageNum
      block.props.searchSort = ctx.searchSort
      block.props.searchSourcesParam = ctx.searchSourcesParam
    }
    if (block.props) {
      for (const value of Object.values(block.props)) {
        if (Array.isArray(value)) injectBlocks(value, ctx)
      }
    }
  }
}

export function injectSearchContext(data: PuckData, ctx: SearchContext): PuckData {
  const cloned = JSON.parse(JSON.stringify(data)) as PuckData
  const content = Array.isArray(cloned.content) ? cloned.content : []
  const zoneBlocks = Object.values(cloned.zones ?? {}).flatMap((z) => (Array.isArray(z) ? z : []))
  injectBlocks([...content, ...zoneBlocks], ctx)
  return cloned
}
