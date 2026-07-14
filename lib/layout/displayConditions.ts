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

export const CONDITION_TYPE_LABELS: Record<ConditionType, string> = {
  entire_site: 'Entire site',
  homepage: 'Homepage',
  page_id: 'Specific page (by ID)',
  page_slug: 'Specific page (by slug)',
  module: 'Module',
  not_found: '404 page',
  coming_soon: 'Coming soon page',
  maintenance: 'Maintenance page',
  path_prefix: 'URL path prefix',
}

/** Rule types that mean nothing without a value typed into them. */
export const VALUE_REQUIRED: ReadonlySet<ConditionType> = new Set<ConditionType>([
  'page_id', 'page_slug', 'module', 'path_prefix',
])

/** A rule the owner has actually finished filling in. */
export function isCompleteRule(rule: ConditionRule): boolean {
  if (!VALUE_REQUIRED.has(rule.type)) return true
  return typeof rule.value === 'string' && rule.value.trim().length > 0
}

const DEFAULT_CONDITION_TYPES: ConditionType[] = [
  'entire_site', 'homepage', 'page_id', 'page_slug', 'module', 'path_prefix',
]

/** Which rules each core layout type is allowed to be shown by. */
export const CONDITION_TYPES_BY_LAYOUT: Record<string, ConditionType[]> = {
  infoPage:   DEFAULT_CONDITION_TYPES,
  header:     ['entire_site', 'homepage', 'path_prefix'],
  footer:     ['entire_site', 'homepage', 'path_prefix'],
  notFound:   ['not_found', 'entire_site'],
  statusPage: ['coming_soon', 'maintenance', 'entire_site'],
}

/** Module layout types are resolved by type alone, so site-wide is the only rule they need. */
export function conditionTypesForLayout(layoutType: string): ConditionType[] {
  return CONDITION_TYPES_BY_LAYOUT[layoutType] ?? ['entire_site']
}

/**
 * The conditions a brand-new layout of this type starts life with.
 *
 * Only filled in where there is no choice to make: a 404 layout shows on 404s,
 * and a module layout (Product, Post, Category, …) is picked by its type alone,
 * so "entire site" is the only rule it can carry. Without this, creating one of
 * those and pressing Update just bounces you with "add a display condition" for
 * a condition you were never given an alternative to.
 *
 * Headers, footers, page layouts and status screens deliberately start empty:
 * there, which layout wins is a decision, and quietly pre-answering it is how a
 * site's design changes without anyone asking for it.
 */
export function defaultConditionsForLayout(layoutType: string): DisplayConditions | null {
  if (layoutType === 'notFound') return { include: [{ type: 'not_found' }], exclude: [] }
  if (!CONDITION_TYPES_BY_LAYOUT[layoutType]) return { include: [{ type: 'entire_site' }], exclude: [] }
  return null
}

/**
 * A path prefix matches on segment boundaries, so `/blog` covers `/blog` and
 * `/blog/hello` but not `/blogging-tips` - which it used to, silently.
 */
function matchesPathPrefix(pathname: string, prefix: string): boolean {
  const p = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix
  if (!p) return false
  return pathname === p || pathname.startsWith(`${p}/`)
}

export function matchesRule(rule: ConditionRule, ctx: RenderContext): boolean {
  // An unfinished rule matches nothing. Without this, a `page_id` rule the owner
  // added but never picked a page for compares undefined === undefined on any
  // page that has no id (a 404, a status screen) and wins with the highest score
  // in the table - so a half-filled rule takes over the pages it was never about.
  if (!isCompleteRule(rule)) return false

  switch (rule.type) {
    case 'entire_site': return true
    case 'homepage': return !!ctx.isHomepage
    case 'not_found': return !!ctx.is404
    case 'coming_soon': return ctx.siteStatus === 'coming_soon'
    case 'maintenance': return ctx.siteStatus === 'maintenance'
    case 'page_id': return !!ctx.pageId && ctx.pageId === rule.value
    case 'page_slug': return !!ctx.slug && ctx.slug === rule.value
    case 'module': return !!ctx.moduleName && ctx.moduleName === rule.value
    case 'path_prefix': return !!ctx.pathname && matchesPathPrefix(ctx.pathname, rule.value ?? '')
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
