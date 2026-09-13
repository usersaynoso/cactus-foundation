// Whether a public page may be held by a shared cache, and for how long.
//
// The switch lives in Settings > General > Speed and is OFF by default. With it
// off nothing here runs and every response is exactly what it was before this
// file existed: Next.js emits its own `private, no-cache, no-store` on a
// dynamic page and no CDN keeps a copy, so every visit wakes a function and
// re-queries the database.
//
// The rule this file exists to enforce is that the decision is ADDITIVE. It
// either returns a Cache-Control that makes a page shareable, or it returns
// null and the response is left completely alone. It never writes `no-store`
// itself. That matters because proxy.ts cannot know whether the page about to
// render is a per-visitor one or a prerendered one, and a blanket `no-store`
// would quietly switch OFF the caching a statically rendered page already
// enjoys - a speed feature that made the site slower.
//
// See lib/modules/cache-cookies.ts for how a module says its own cookie means
// "this visitor's page is personal, do not share it".

import { moduleCacheBypassCookies } from '@/lib/modules/cache-cookies'

// The windows offered in Settings. Deliberately a short list rather than a free
// text box: the useful range is "long enough to absorb a burst of traffic, short
// enough that a price edit is not stale for long", and every value outside it is
// somebody about to have a bad afternoon.
export const PAGE_CACHE_TTL_OPTIONS = [60, 300, 900, 3600, 21600, 86400] as const
export type PageCacheTtl = (typeof PAGE_CACHE_TTL_OPTIONS)[number]
export const DEFAULT_PAGE_CACHE_TTL: PageCacheTtl = 300

export function normalisePageCacheTtl(value: unknown): PageCacheTtl {
  const n = typeof value === 'number' ? value : Number(value)
  return (PAGE_CACHE_TTL_OPTIONS as readonly number[]).includes(n)
    ? (n as PageCacheTtl)
    : DEFAULT_PAGE_CACHE_TTL
}

// The second, longer window, for the addresses that make up the long tail of a
// site's crawl surface rather than the pages people actually browse:
//
//   - anything carrying a query string. On a shop with options that is every
//     buyable combination of every product - a catalogue of 731 pages can put
//     19,000 addresses in its own sitemap - and each one is a separate entry in
//     every cache in front of the site, so each one is separately re-rendered
//     the moment its window closes. They also change far less often than the
//     ordinary pages do, because the thing they describe is the same product.
//   - the machine-read files: the sitemap, robots.txt, the feeds. A sitemap is
//     a query over the whole catalogue, asked for by crawlers rather than
//     people, and nobody is sitting there waiting for it to be current.
//
// 0 means "no second window" - everything uses the ordinary one, which is what
// every install did before this setting existed. Never SHORTER than the
// ordinary window: a number below it would be a way to make the site slower by
// accident, so the longer of the two wins.
export const PAGE_CACHE_LONG_TTL_OPTIONS = [0, 3600, 21600, 86400, 604800] as const
export type PageCacheLongTtl = (typeof PAGE_CACHE_LONG_TTL_OPTIONS)[number]
export const DEFAULT_PAGE_CACHE_LONG_TTL: PageCacheLongTtl = 0

export function normalisePageCacheLongTtl(value: unknown): PageCacheLongTtl {
  const n = typeof value === 'number' ? value : Number(value)
  return (PAGE_CACHE_LONG_TTL_OPTIONS as readonly number[]).includes(n)
    ? (n as PageCacheLongTtl)
    : DEFAULT_PAGE_CACHE_LONG_TTL
}

// Seconds Vercel's own edge may hold a copy on a site that has something
// downstream of it - see vercelCdnCacheControl below for why that is a separate
// number at all. 0 is the old behaviour: Vercel keeps nothing and every miss
// downstream is a function invocation.
export const VERCEL_EDGE_TTL_OPTIONS = [0, 60, 300, 900] as const
export type VercelEdgeTtl = (typeof VERCEL_EDGE_TTL_OPTIONS)[number]
export const DEFAULT_VERCEL_EDGE_TTL: VercelEdgeTtl = 60

export function normaliseVercelEdgeTtl(value: unknown): VercelEdgeTtl {
  // Not the plain Number() coercion the two above use, because 0 is a MEANINGFUL
  // option here: `Number(null)` is 0, so a missing column would otherwise read as
  // a deliberate "keep nothing" rather than falling back to the default.
  const n = typeof value === 'number' ? value : value === null || value === undefined || value === '' ? NaN : Number(value)
  return (VERCEL_EDGE_TTL_OPTIONS as readonly number[]).includes(n)
    ? (n as VercelEdgeTtl)
    : DEFAULT_VERCEL_EDGE_TTL
}

// The machine-read addresses that get the long window. Matched on the path
// alone, so a page of a site's own called "sitemap" (/sitemap, no extension) is
// not one of them.
//
// The .md suffix is in here for the Markdown twin of every page - nothing else
// on the site answers on that suffix, and a page whose slug genuinely ends in
// ".md" is served as Markdown too, so it belongs in the same window either way.
const MACHINE_READ_PATH = /^\/(?:robots\.txt|llms\.txt|llms-full\.txt|sitemap[\w-]*\.xml)$|\/feed\.xml$|\.md$/

export function usesLongCacheWindow(path: string, hasQuery: boolean): boolean {
  return hasQuery || MACHINE_READ_PATH.test(path)
}

/**
 * Which of the two windows this request's answer may be held for.
 *
 * Exported for the tests and for anything that needs the same number the header
 * carries; pageCacheControl and cdnCacheControl both go through it.
 */
export function resolveCacheWindow(input: {
  ttl: number
  longTtl?: number
  path?: string
  hasQuery?: boolean
}): number {
  const base = normalisePageCacheTtl(input.ttl)
  const long = normalisePageCacheLongTtl(input.longTtl ?? 0)
  if (long <= 0) return base
  if (!usesLongCacheWindow(input.path ?? '/', input.hasQuery ?? false)) return base
  return Math.max(base, long)
}

// Core's own "this visitor is signed in" cookies. An admin session because an
// admin sees edit affordances and unpublished work; a member session because a
// member area page is theirs alone. Kept here rather than imported from the two
// auth modules so the whole bypass list reads as one thing.
export const CORE_CACHE_BYPASS_COOKIES = ['cactus_session', 'cactus_member_session'] as const

// Every cookie whose presence means "do not let anything share this response",
// core's plus whatever the installed modules declared. Sorted and de-duplicated
// so the list is stable whichever order the modules were installed in.
export function cacheBypassCookieNames(): string[] {
  return [...new Set([...CORE_CACHE_BYPASS_COOKIES, ...moduleCacheBypassCookies])].sort()
}

export type PageCacheDecisionInput = {
  enabled: boolean
  ttl: number
  // The second, longer window and what decides whether this request qualifies
  // for it. Optional, so a caller that has not been taught about it yet behaves
  // exactly as it did before: no long window, ordinary ttl for everything.
  longTtl?: number
  path?: string
  hasQuery?: boolean
  method: string
  // Reads one request header by name, case-insensitively.
  header: (name: string) => string | null
  // True when the named cookie is present on the request.
  hasCookie: (name: string) => boolean
}

/**
 * The Cache-Control to add to a public page response, or null to leave the
 * response untouched.
 *
 * Returns null - never a `no-store` of its own - for anything that must not be
 * shared. See the note at the top of the file for why that asymmetry is
 * deliberate.
 */
export function pageCacheControl(input: PageCacheDecisionInput): string | null {
  if (!input.enabled) return null

  // A cache entry is only ever created by a GET or a HEAD. Anything else is
  // doing something, not reading something.
  const method = input.method.toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') return null

  // React Server Component payloads share their URL with the HTML document and
  // are told apart only by request headers, which Next.js correctly advertises
  // in `Vary`. Cloudflare - the CDN this feature was built for - honours Vary
  // for Accept-Encoding and NOTHING else, so a shared cache that is allowed to
  // hold both will sooner or later hand a client-side navigation's flight data
  // to a browser asking for a page, or a document to a router expecting flight
  // data. Both render as a broken site.
  //
  // Rather than trust a CDN setting nobody can see from here, only the plain
  // document request is ever made cacheable. The flight payloads carry no
  // Cache-Control from us, so they stay out of the cache entirely and are
  // fetched from the origin as they are today.
  if (input.header('rsc')) return null
  if (input.header('next-router-prefetch')) return null
  if (input.header('next-router-state-tree')) return null

  // Range requests get their own entry semantics; not worth the surface area.
  if (input.header('range')) return null

  // Signed in, or carrying a basket, or carrying anything a module said makes a
  // page personal. Left alone, so the response keeps whatever Next.js decides -
  // which for a per-visitor page is the `no-store` it already sends.
  for (const name of cacheBypassCookieNames()) {
    if (input.hasCookie(name)) return null
  }

  const ttl = resolveCacheWindow(input)
  // max-age=0 keeps the visitor's OWN browser out of it: they revalidate every
  // time and so never sit on a stale copy of a page they might have just been
  // told was updated. s-maxage is the part a shared cache reads.
  // stale-while-revalidate lets it answer instantly from an expired copy while
  // it refreshes in the background, so the one unlucky visitor who arrives at
  // the moment the window closes does not pay for the re-render either.
  //
  // On a self-hosted install this is the header that does the work. On Vercel it
  // is overwritten before it reaches the wire - see cdnCacheControl below, which
  // is the one that actually survives there.
  return `public, max-age=0, s-maxage=${ttl}, stale-while-revalidate=${ttl}`
}

/**
 * The same decision, expressed in the header a CDN reads in preference to
 * Cache-Control.
 *
 * This exists because the first attempt did not work on Vercel and the site
 * carried on answering `no-store` with the switch on. Next.js writes its own
 * Cache-Control for a rendered page; on a self-hosted server it skips that when
 * one is already present (`sendRenderResult` in next/dist/server/send-payload.js)
 * and the proxy's header wins, but Vercel does not use that path and overwrites
 * it. Proxy-set headers DO otherwise survive there - the site's CSP and HSTS
 * arrive intact - so the problem was only ever this one header name.
 *
 * CDN-Cache-Control (RFC 9213) is not a header Next.js has any opinion about, so
 * nothing overwrites it, and Cloudflare reads it in PREFERENCE to Cache-Control
 * (precedence: Cloudflare-CDN-Cache-Control > CDN-Cache-Control > Cache-Control).
 * The result is the split we wanted anyway: shared caches keep a copy, the
 * visitor's own browser is still told `no-store` by Next and keeps none.
 *
 * The window is spelled `max-age` here, not `s-maxage`, and that is not a
 * slip. This header is only ever read by shared caches (browsers ignore it), so
 * `max-age` already means "how long the CDN may keep it" - and `s-maxage`
 * implies `proxy-revalidate`, which forbids a shared cache from handing out a
 * stale copy at all. Cloudflare says so in as many words ("Do not use s-maxage
 * with stale-while-revalidate"), and it is why the first version of this header,
 * `public, s-maxage=<ttl>`, made every visitor who arrived after a window closed
 * wait for a full re-render: one to three seconds on a product page, where a
 * cached copy answers in under two hundred milliseconds.
 *
 * With `stale-while-revalidate` that visitor gets the old copy at once and the
 * fresh one is built behind them. Cloudflare's revalidation is asynchronous
 * (the response reads `cf-cache-status: UPDATING`), and Vercel's edge does the
 * same when it is the cache reading this header.
 *
 * An earlier note here said Cloudflare answers BYPASS for any directive beyond
 * `public` and `s-maxage`. That rule is Cloudflare's reading of RFC 7234 section
 * 3.2 and applies to responses to requests carrying an `Authorization` header,
 * which a public page request never does. If a live site ever shows
 * `cf-cache-status: BYPASS` on a cacheable page after this change, that reading
 * was wrong and this is the line to put back.
 */
export function cdnCacheControl(ttl: number): string {
  return sharedCacheDirectives(normalisePageCacheTtl(ttl))
}

/**
 * The directives both CDN-Cache-Control spellings carry for a given number of
 * seconds. One place, so the ordinary and long windows cannot drift apart.
 */
function sharedCacheDirectives(seconds: number): string {
  return `public, max-age=${seconds}, stale-while-revalidate=${seconds}`
}

/**
 * The same header for a request that qualified for the long window.
 *
 * Separate from cdnCacheControl above rather than an extra argument to it,
 * because the number here has already been through resolveCacheWindow and must
 * NOT be run through normalisePageCacheTtl again - the long windows are not
 * members of the ordinary option list, so normalising one would silently reset
 * a 24-hour window to five minutes.
 */
export function cdnCacheControlForWindow(seconds: number): string {
  return sharedCacheDirectives(Math.max(0, Math.floor(seconds)))
}

/**
 * What Vercel's own edge is told, when something downstream can be purged.
 *
 * CDN-Cache-Control above is read by every shared cache in the chain, and on a
 * Vercel install that chain starts with Vercel's own Edge Network - which holds
 * its copy for the full window like any other CDN, and, unlike Cloudflare, has
 * no purge API to call. So a publish would drop Cloudflare's copy, Cloudflare
 * would refill from Vercel, and Vercel would hand back the same stale page and
 * have it cached for another window. Purging looked broken because the layer
 * being purged was never the one holding the old page.
 *
 * Vercel-CDN-Cache-Control outranks CDN-Cache-Control at Vercel and is stripped
 * before the response leaves it, so the copy moves one hop down the chain to the
 * cache that can actually be emptied: Cloudflare still sees the owner's window and
 * still answers nearly every request, and the purge on publish now lands on the
 * only copy there is.
 *
 * Only worth doing when there IS something downstream to purge - see the caller.
 * With no purge token configured nothing in the chain can be emptied anyway, the
 * owner has already accepted "changes appear within the window", and Vercel
 * holding the copy is the whole benefit of the switch rather than a bug.
 *
 * `ttl` is how long Vercel may keep its copy anyway (Settings > General >
 * Speed). Handing the whole window downstream and keeping nothing at all was
 * the first version of this, and it meant every single miss at Cloudflare -
 * every crawler arriving at a cold location, every address whose window had
 * just closed - re-rendered the page in a function. A short window here absorbs
 * exactly that, at the cost of a publish's purge taking up to `ttl` to be
 * visible everywhere rather than being instant. 0 restores the old behaviour
 * for an owner who wants the purge to be the last word.
 */
export function vercelCdnCacheControl(ttl: number = 0, window?: number): string {
  const seconds = normaliseVercelEdgeTtl(ttl)
  // Never longer than what the cache downstream was told: Vercel holding a copy
  // for longer than Cloudflare does would put the stale one BACK in Cloudflare
  // the moment Cloudflare's own expired, which is the failure this whole split
  // exists to avoid.
  const capped = window === undefined ? seconds : Math.min(seconds, Math.max(0, Math.floor(window)))
  if (capped <= 0) return 'public, s-maxage=0, must-revalidate'
  return `public, s-maxage=${capped}`
}
