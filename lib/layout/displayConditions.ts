export type ConditionType =
  | 'entire_site'
  | 'homepage'
  | 'page_id'
  | 'page_slug'
  | 'module'
  | 'not_found'
  | 'coming_soon'
  | 'maintenance'
  | 'path_prefix'

export type ConditionRule = { type: ConditionType; value?: string }

export type DisplayConditions = {
  include: ConditionRule[]
  exclude: ConditionRule[]
}

export type RenderContext = {
  pageId?: string
  slug?: string
  moduleName?: string
  isHomepage?: boolean
  is404?: boolean
  siteStatus?: 'coming_soon' | 'maintenance' | 'normal'
  pathname?: string
}

const SCORES: Record<ConditionType, number> = {
  page_id: 100,
  page_slug: 90,
  homepage: 80,
  not_found: 80,
  coming_soon: 80,
  maintenance: 80,
  module: 50,
  path_prefix: 40,
  entire_site: 10,
}

export function matchesRule(rule: ConditionRule, ctx: RenderContext): boolean {
  switch (rule.type) {
    case 'entire_site': return true
    case 'homepage': return !!ctx.isHomepage
    case 'not_found': return !!ctx.is404
    case 'coming_soon': return ctx.siteStatus === 'coming_soon'
    case 'maintenance': return ctx.siteStatus === 'maintenance'
    case 'page_id': return ctx.pageId === rule.value
    case 'page_slug': return ctx.slug === rule.value
    case 'module': return ctx.moduleName === rule.value
    case 'path_prefix': return !!ctx.pathname?.startsWith(rule.value ?? '')
    default: return false
  }
}

export function scoreConditions(conditions: DisplayConditions, ctx: RenderContext): number {
  const excluded = conditions.exclude?.some(r => matchesRule(r, ctx))
  if (excluded) return -1
  let best = -1
  for (const rule of conditions.include ?? []) {
    if (matchesRule(rule, ctx)) best = Math.max(best, SCORES[rule.type] ?? 0)
  }
  return best
}
