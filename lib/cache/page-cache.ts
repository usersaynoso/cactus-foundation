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
export const PAGE_CACHE_TTL_OPTIONS = [60, 300, 900, 3600] as const
export type PageCacheTtl = (typeof PAGE_CACHE_TTL_OPTIONS)[number]
export const DEFAULT_PAGE_CACHE_TTL: PageCacheTtl = 300

export function normalisePageCacheTtl(value: unknown): PageCacheTtl {
  const n = typeof value === 'number' ? value : Number(value)
  return (PAGE_CACHE_TTL_OPTIONS as readonly number[]).includes(n)
    ? (n as PageCacheTtl)
    : DEFAULT_PAGE_CACHE_TTL
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

  const ttl = normalisePageCacheTtl(input.ttl)
  // max-age=0 keeps the visitor's OWN browser out of it: they revalidate every
  // time and so never sit on a stale copy of a page they might have just been
  // told was updated. s-maxage is the part a CDN reads. stale-while-revalidate
  // lets the CDN answer instantly from an expired copy while it refreshes in
  // the background, so the one unlucky visitor who arrives at the moment the
  // window closes does not pay for the re-render either.
  return `public, max-age=0, s-maxage=${ttl}, stale-while-revalidate=${ttl}`
}
