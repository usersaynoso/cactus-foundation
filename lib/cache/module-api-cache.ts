import { cacheBypassCookieNames, cdnCacheControlForWindow } from '@/lib/cache/page-cache'
import { getPageCacheCached } from '@/lib/config/site'

// Shared-cache headers for a module's own public API responses.
//
// The page cache (proxy.ts) only ever reaches rendered pages. It never sees a
// module route, because every one of those is served through the dispatcher at
// app/api/m/[module]/[...path] and answers with a Response the proxy has already
// finished with. That left the busiest thing on a storefront uncached: a product
// page whose HTML is answered by a CDN still fires its islands - reviews, related
// products, the variation selector - at the origin on every single view, and once
// the pages themselves are cached those calls are most of what wakes a function
// at all.
//
// A route opts in by exporting a number of seconds:
//
//   export const publicCacheTtl = 300
//
// which is a statement by whoever wrote it that the answer depends on the URL and
// on shop-wide settings, and on nothing about who is asking. The dispatcher does
// the rest, so the rules below are applied in ONE place rather than
// re-implemented (and eventually got wrong) in each module.
//
// Everything here is deliberately conservative - the cost of wrongly caching one
// response is that a CDN hands it to everybody for the whole window.
export const MODULE_API_CACHE_EXPORT = 'publicCacheTtl'

// Longest window a route may ask for. Not a policy about staleness so much as a
// guard against a typo: `publicCacheTtl = 3000` reads like fifty minutes and is
// not, and a module is not the right place to decide a site's whole caching
// posture from.
const MAX_MODULE_API_TTL = 3600

function declaredTtl(routeModule: Record<string, unknown>): number | null {
  const raw = routeModule[MODULE_API_CACHE_EXPORT]
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return null
  return Math.min(Math.floor(raw), MAX_MODULE_API_TTL)
}

// Cookie names off a plain Request. The dispatcher is handed a Request rather
// than a NextRequest, so there is no `.cookies` to ask; the header is parsed for
// names alone because no value is ever read here.
function cookieNames(req: Request): Set<string> {
  const header = req.headers.get('cookie')
  if (!header) return new Set()
  return new Set(
    header
      .split(';')
      .map((part) => part.split('=')[0]?.trim() ?? '')
      .filter(Boolean),
  )
}

/**
 * Adds shared-cache headers to a module API response, or returns it untouched.
 *
 * Additive, exactly like the page cache: it never writes a `no-store` of its
 * own, so a route that has made its own arrangements keeps them.
 */
export async function applyModuleApiCache(
  req: Request,
  res: Response,
  routeModule: Record<string, unknown>,
): Promise<Response> {
  const ttl = declaredTtl(routeModule)
  if (ttl === null) return res

  // Only a plain read of a thing, and only one that worked. An error is often
  // the transient kind, and a CDN holding a 500 for the window turns a blip into
  // an outage.
  if (req.method !== 'GET' && req.method !== 'HEAD') return res
  if (res.status !== 200) return res

  // The route said something about its own caching. It knows more than this does.
  if (res.headers.has('Cache-Control') || res.headers.has('CDN-Cache-Control')) return res

  // Signed in, or carrying anything a module declared as "this visitor's answer
  // is their own". Same list the page cache uses, so a request that would not
  // have had its PAGE cached does not have its data cached either.
  const names = cookieNames(req)
  if (cacheBypassCookieNames().some((name) => names.has(name))) return res

  // The owner's switch (Settings > General > Speed). One control for the whole
  // idea of handing out ready-made copies, rather than a second, invisible one
  // that only applies to data.
  const { enabled, vercelEdgeTtl, behindCloudflare } = await getPageCacheCached().catch(() => ({
    enabled: false,
    vercelEdgeTtl: 0,
    behindCloudflare: false,
  }))
  if (!enabled) return res

  const headers = new Headers(res.headers)
  headers.set('Cache-Control', `public, max-age=0, s-maxage=${ttl}, stale-while-revalidate=${ttl}`)
  // The one that survives Vercel, which rewrites Cache-Control on its way out -
  // see the long note in lib/cache/page-cache.ts. Same asymmetry as the pages.
  headers.set('CDN-Cache-Control', cdnCacheControlForWindow(ttl))
  if (behindCloudflare) {
    headers.set(
      'Vercel-CDN-Cache-Control',
      vercelEdgeTtl > 0 ? `public, s-maxage=${Math.min(vercelEdgeTtl, ttl)}` : 'public, s-maxage=0, must-revalidate',
    )
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}
