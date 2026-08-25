import { NextResponse } from 'next/server'
import { resolveBranding, BRANDING_DEFAULTS, type ResolvedBranding } from '@/lib/config/branding'

// Every icon the browser fetches, served from the site's own address rather
// than from a file baked into the build or from the media host the icon
// actually lives on. next.config.ts rewrites the well-known paths here
// (beforeFiles, so they beat the static file handler):
//
//   /favicon.ico                        -> ?icon=favicon
//   /apple-touch-icon.png               -> ?icon=apple-touch
//   /apple-touch-icon-precomposed.png   -> ?icon=apple-touch
//   /web-app-manifest-192x192.png       -> ?icon=icon-192
//   /web-app-manifest-512x512.png       -> ?icon=icon-512
//
// Why they have to be routes at all: the <link> tags the root layout emits only
// reach responses that HAVE a document head. /sitemap.xml, /robots.txt, a JSON
// API response, a downloaded file - none of them carry one, so the browser
// falls back to the origin's /favicon.ico and, before this, found the bundled
// Cactus icon sat there. A site with its own favicon then showed somebody
// else's logo on its own sitemap, which is the sort of thing an owner notices.
// Safari probes /apple-touch-icon.png at the root the same way.
//
// Answers with the BYTES, not a redirect. It used to redirect, on the reasoning
// that proxying a CDN-hosted icon buys a second hop and nothing else. That
// reasoning missed how browsers fetch an icon: last, at the lowest priority
// there is, and the result is then cached against the PAGE url. Sending them to
// a third-party media host meant the icon queued behind every product image on
// that same host, and one dropped fetch left that one page with a blank tab
// until the browser's icon cache aged out. Served from the site's own origin it
// rides the connection the document already has open, and the CDN in front of
// this route carries the cost, not the visitor. A Deskwell category page issues
// 49 requests to the media host against the homepage's 7, so the odds are worse
// on the heavy pages - though the "some pages have no favicon" report itself
// was diagnosed at core 0.5.1290 as page weight (7.2 MB, load at 15.2 s) rather
// than icon addressing, and paging has since cut that page to 706 KB. This is
// about removing the cross-origin dependency, not a claimed cure for that.
//
// ?scheme=dark answers with the dark-mode favicon when Appearance has one, so
// the colour-scheme-scoped <link> tags in the root layout can both point at an
// address on this origin.
export const dynamic = 'force-dynamic'

// Long enough that a slow media host cannot pin a function open, short enough
// that the browser gives up on us rather than the other way round.
const UPSTREAM_TIMEOUT_MS = 5000

// Short enough that changing an icon in Appearance shows up the same day, long
// enough that a tab icon is not a database read per page view.
const CACHE_CONTROL = 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400'

type Variant = {
  // Where the admin's uploaded icon lives, if they have uploaded one.
  source: (b: ResolvedBranding) => string | null
  // The bundled Cactus equivalent. Deliberately NOT the address the rewrite
  // listens on: a fall-back that redirected to the path that routes back here
  // would meet itself coming the other way.
  fallback: string
  // Used only when the media host declines to say.
  contentType: string
}

const VARIANTS = {
  favicon: {
    source: (b) => b.faviconUrl,
    fallback: BRANDING_DEFAULTS.favIcoFallback,
    contentType: 'image/x-icon',
  },
  'favicon-dark': {
    source: (b) => b.faviconDarkUrl ?? b.faviconUrl,
    fallback: BRANDING_DEFAULTS.favIcoFallback,
    contentType: 'image/x-icon',
  },
  'apple-touch': {
    source: (b) => b.appleTouchUrl,
    fallback: BRANDING_DEFAULTS.appleTouchFallback,
    contentType: 'image/png',
  },
  'icon-192': {
    source: (b) => b.icon192Url,
    fallback: BRANDING_DEFAULTS.icon192Fallback,
    contentType: 'image/png',
  },
  'icon-512': {
    source: (b) => b.icon512Url,
    fallback: BRANDING_DEFAULTS.icon512Fallback,
    contentType: 'image/png',
  },
} satisfies Record<string, Variant>

function variantFor(url: URL): Variant {
  const named = url.searchParams.get('icon')
  if (named && named in VARIANTS) return VARIANTS[named as keyof typeof VARIANTS]
  // ?scheme=dark predates the named variants and is still what the root layout
  // emits for the dark favicon, so it keeps working.
  if (url.searchParams.get('scheme') === 'dark') return VARIANTS['favicon-dark']
  return VARIANTS.favicon
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const variant = variantFor(requestUrl)

  let source: string | null = null
  try {
    source = variant.source(await resolveBranding())
  } catch {
    // Branding unreadable (mid-setup, database asleep) - the Cactus icon is a
    // better answer than a 500 on a request the browser made on its own.
  }

  // No custom icon: hand back the bundled Cactus one. A redirect is right here
  // because the target is a static file on this same origin, so there is no
  // cross-origin fetch to lose and no function to run for the bytes.
  if (!source) return fallback(request, variant)

  // Every media provider hands back an absolute url, but the field is a plain
  // string and nothing stops a hand-written relative one, which fetch() would
  // throw on.
  let target: URL
  try {
    target = new URL(source, request.url)
  } catch {
    return fallback(request, variant)
  }

  // Already ours: redirect, for the same reason the fall-back does. Proxying an
  // icon that is on this origin anyway would buy a second hop and nothing else
  // - the cross-origin queue is the whole problem being solved here, and there
  // isn't one.
  if (target.origin === requestUrl.origin) {
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
      return new NextResponse(null, { status: 304, headers: passThrough(upstream, variant) })
    }
    if (!upstream.ok || !upstream.body) return fallback(request, variant)

    return new NextResponse(upstream.body, { status: 200, headers: passThrough(upstream, variant) })
  } catch {
    // Media host slow, down, or the url has rotted. A Cactus icon beats a
    // broken tab.
    return fallback(request, variant)
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
function passThrough(upstream: Response, variant: Variant): Headers {
  const headers = new Headers()
  headers.set('Content-Type', upstream.headers.get('content-type') || variant.contentType)
  const etag = upstream.headers.get('etag')
  if (etag) headers.set('ETag', etag)
  const length = upstream.headers.get('content-length')
  if (length) headers.set('Content-Length', length)
  headers.set('Cache-Control', CACHE_CONTROL)
  headers.set('X-Content-Type-Options', 'nosniff')
  return headers
}

function fallback(request: Request, variant: Variant) {
  const res = NextResponse.redirect(new URL(variant.fallback, request.url), 307)
  res.headers.set('Cache-Control', CACHE_CONTROL)
  return res
}
