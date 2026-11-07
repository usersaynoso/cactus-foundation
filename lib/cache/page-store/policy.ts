// What the page store may hold, and which one entry a request maps to.
//
// Pure functions and no imports beyond the sibling cache file, so the rules can be
// read and tested without a server. See ./engine.ts for the store itself and for
// why it exists at all.
//
// The rule for deep addresses is an allow-list, on purpose. A site's single-segment
// addresses are overwhelmingly content (an info page, a product, a landing page),
// so those are held unless they belong to a module. Anything deeper, and a module's
// own index page, is only held once the owner has named it: /quote/<code> and
// /purchase-order/<number> are single documents for one person, and a module added
// next year must not have its private pages stored because nobody thought to
// exclude them.

import { carriesAccessKey } from '@/lib/cache/page-cache'
import { isTrackingParam } from '@/lib/cache/page-cache'

// The most an address can be and still be stored. A longer one is either a mistake
// or somebody generating addresses, and neither is worth a place in the store.
const MAX_PATH_LENGTH = 512
const MAX_QUERY_LENGTH = 1024

/** The parts of a stored address the owner has a say in. Parsed from Settings > Speed. */
export type PageStoreRules = {
  // Exact paths and `/prefix/*` patterns, on top of the single-segment default.
  paths: string[]
  // Bases of the installed modules' public pages (generated; see generate-module-cache-cookies).
  moduleBases: readonly string[]
}

// One entry per line (or comma), blanks and anything that is not an address dropped.
export function parsePathPatterns(raw: string | null | undefined): string[] {
  return (raw ?? '')
    .split(/[\n,]+/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('/') && line.length > 1 && !line.includes('?'))
}

function matchesPattern(path: string, pattern: string): boolean {
  if (pattern.endsWith('/*')) return path.startsWith(pattern.slice(0, -1)) && path.length > pattern.length - 1
  return path === pattern
}

/**
 * Whether this path may be held at all.
 *
 * isPrivatePath (page-cache.ts) has already had its say by the time this runs, via
 * the shareable decision in the proxy, but it is asked again here: being wrong in
 * this direction hands one visitor's page to another.
 */
export function isStorablePath(path: string, rules: PageStoreRules, isPrivatePath: (p: string) => boolean): boolean {
  if (path === '/') return true
  if (path.length > MAX_PATH_LENGTH || !path.startsWith('/') || path.endsWith('/')) return false
  if (isPrivatePath(path)) return false
  if (rules.paths.some((pattern) => matchesPattern(path, pattern))) return true

  const segments = path.slice(1).split('/')
  if (segments.length !== 1) return false
  const only = segments[0] ?? ''
  // A dot means a file (feed.xml, robots.txt, a page's Markdown twin), never a page.
  if (only === '' || only.includes('.')) return false
  return !rules.moduleBases.includes(only)
}

/**
 * The query string a stored page is keyed and rendered under.
 *
 * Tracking tags go, because they change where a visitor came from and nothing about
 * the page. What is left is sorted by name so `?a=1&b=2` and `?b=2&a=1` are one
 * entry, keeping the relative order of repeats of one name (which can mean
 * something). Everything else is left exactly as it arrived: `?width=180cm` is a
 * different page and must render as one.
 *
 * Returns null when this query keeps the request out of the store altogether.
 */
export function normaliseQuery(search: string): string | null {
  if (search.length > MAX_QUERY_LENGTH) return null
  if (carriesAccessKey(search)) return null
  const query = search.startsWith('?') ? search.slice(1) : search
  if (query === '') return ''

  const kept: Array<{ name: string; pair: string }> = []
  for (const pair of query.split('&')) {
    if (pair === '') continue
    const rawName = pair.split('=')[0] ?? ''
    let name: string
    try {
      name = decodeURIComponent(rawName.replace(/\+/g, ' '))
    } catch {
      // Not valid percent-encoding: not an address worth keeping a copy of.
      return null
    }
    // A flight-data request that lost its headers on the way here. Never a document.
    if (name === '_rsc') return null
    if (isTrackingParam(name)) continue
    kept.push({ name, pair })
  }
  kept.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return kept.length === 0 ? '' : `?${kept.map((k) => k.pair).join('&')}`
}

/** The entry a request belongs to. Host included: one install can answer on several. */
export function pageStoreKey(host: string, path: string, query: string): string {
  return `${host.toLowerCase()}${path}${query}`
}

// Tables whose writes never change a public page, on every install. Anything not
// named here, or in the owner's own list, counts: a table nobody thought about
// costs one needless re-render, whereas ignoring the wrong one leaves a stale price.
// SiteConfig is here because it also carries deploy bookkeeping; the settings screen
// signals the store directly when an owner saves (see ./signal.ts).
export const CORE_IGNORED_TABLES = [
  '_prisma_migrations',
  'CronRun',
  'DeployLock',
  'Module',
  'ModuleMigration',
  'SiteConfig',
  'Session',
  'MemberSession',
  'TrustedDevice',
  'EmailChallenge',
  'EmailEvent',
  'RecoveryRequest',
  'RateLimit',
  'ConsentRecord',
  'Notification',
  'AdminPushSubscription',
  'MediaRetiredBlob',
  'MediaMigrationJob',
  'MediaFormerAddress',
] as const

// Exact names, or `prefix*`. Same line-or-comma format as the path list.
export function parseIgnoredTables(raw: string | null | undefined): string[] {
  return (raw ?? '')
    .split(/[\n,]+/)
    .map((line) => line.trim())
    .filter((line) => /^[A-Za-z0-9_]+\*?$/.test(line))
}

export function isIgnoredTable(table: string, ignored: readonly string[]): boolean {
  return ignored.some((rule) => (rule.endsWith('*') ? table.startsWith(rule.slice(0, -1)) : table === rule))
}
