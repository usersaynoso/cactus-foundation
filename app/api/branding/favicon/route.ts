import { NextResponse } from 'next/server'
import { resolveBranding, BRANDING_DEFAULTS } from '@/lib/config/branding'

// /favicon.ico, served from the admin's Appearance branding rather than from a
// file baked into the build. next.config.ts rewrites the well-known path here
// (beforeFiles, so it beats the static file handler).
//
// Why it has to be a route at all: the <link rel="icon"> tags the root layout
// emits only reach responses that HAVE a document head. /sitemap.xml,
// /robots.txt, a JSON API response, a downloaded file - none of them carry one,
// so the browser falls back to the origin's /favicon.ico and, before this,
// found the bundled Cactus icon sat there. A site with its own favicon then
// showed somebody else's logo on its own sitemap, which is the sort of thing an
// owner notices.
//
// Answers with the BYTES, not a redirect. It used to redirect, on the reasoning
// that proxying a CDN-hosted icon buys a second hop and nothing else. That
// reasoning missed how browsers fetch a tab icon: last, at the lowest priority
// there is, and the result is then cached against the PAGE url. Sending them to
// a third-party media host meant the icon queued behind every product image on
// that same host, and one dropped fetch left that one page with a blank tab
// until the browser's favicon cache aged out - which is exactly the "some pages
// have no favicon" report. Served from the site's own origin it rides the
// connection the document already has open, and the CDN in front of this route
// carries the cost, not the visitor.
//
// ?scheme=dark answers with the dark-mode icon when Appearance has one, so the
// colour-scheme-scoped <link> tags in the root layout can both point at an
// address on this origin.
export const dynamic = 'force-dynamic'

// Long enough that a slow media host cannot pin a function open, short enough
// that the browser gives up on us rather than the other way round.
const UPSTREAM_TIMEOUT_MS = 5000

// Short enough that changing the favicon in Appearance shows up the same day,
// long enough that a tab icon is not a database read per page view.
const CACHE_CONTROL = 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400'

export async function GET(request: Request) {
  const wantsDark = new URL(request.url).searchParams.get('scheme') === 'dark'

  let source: string | null = null
  try {
    const branding = await resolveBranding()
    source = (wantsDark ? branding.faviconDarkUrl : null) ?? branding.faviconUrl
  } catch {
    // Branding unreadable (mid-setup, database asleep) - the Cactus icon is a
    // better answer than a 500 on a request the browser made on its own.
  }

  // No custom icon: hand back the bundled Cactus one. A redirect is right here
  // because the target is a static file on this same origin, so there is no
  // cross-origin fetch to lose and no function to run for the bytes.
  if (!source) return fallback(request)

  // Every media provider hands back an absolute url, but the field is a plain
  // string and nothing stops a hand-written relative one, which fetch() would
  // throw on.
  let target: URL
  try {
    target = new URL(source, request.url)
  } catch {
    return fallback(request)
  }

  // Already ours: redirect, for the same reason the fall-back does. Proxying an
  // icon that is on this origin anyway would buy a second hop and nothing else
  // - the cross-origin queue is the whole problem being solved here, and there
  // isn't one.
  if (target.origin === new URL(request.url).origin) {
    const res = NextResponse.redirect(target, 307)
    res.headers.set('Cache-Control', CACHE_CONTROL)
    return res
  }

  try {
    const upstream = await fetch(target, {
      // Conditional requests forwarded so a browser that already has the icon
      // gets a 304 rather than the bytes again.
      headers: conditionalHeaders(request),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      redirect: 'follow',
      cache: 'no-store',
    })

    if (upstream.status === 304) {
      return new NextResponse(null, { status: 304, headers: passThrough(upstream) })
    }
    if (!upstream.ok || !upstream.body) return fallback(request)

    return new NextResponse(upstream.body, { status: 200, headers: passThrough(upstream) })
  } catch {
    // Media host slow, down, or the url has rotted. A Cactus icon beats a
    // broken tab.
    return fallback(request)
  }
}

function conditionalHeaders(request: Request): HeadersInit {
  const headers: Record<string, string> = {}
  const ifNoneMatch = request.headers.get('if-none-match')
  if (ifNoneMatch) headers['if-none-match'] = ifNoneMatch
  return headers
}

// Deliberately built from scratch rather than forwarded wholesale: the media
// host sets its own CORS and Vary headers, which mean nothing once the bytes
// are coming from this origin and only muddy the CDN cache key.
function passThrough(upstream: Response): Headers {
  const headers = new Headers()
  headers.set('Content-Type', upstream.headers.get('content-type') || 'image/x-icon')
  const etag = upstream.headers.get('etag')
  if (etag) headers.set('ETag', etag)
  const length = upstream.headers.get('content-length')
  if (length) headers.set('Content-Length', length)
  headers.set('Cache-Control', CACHE_CONTROL)
  headers.set('X-Content-Type-Options', 'nosniff')
  return headers
}

function fallback(request: Request) {
  const res = NextResponse.redirect(
    new URL(BRANDING_DEFAULTS.favIcoFallback, request.url),
    307,
  )
  res.headers.set('Cache-Control', CACHE_CONTROL)
  return res
}
