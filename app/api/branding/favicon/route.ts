import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { resolveBranding, BRANDING_DEFAULTS, type ResolvedBranding } from '@/lib/config/branding'
import { buildIco } from '@/lib/config/favicon-ico'

// Every icon the browser fetches, served from the site's own address rather
// than from a file baked into the build or from the media host the icon
// actually lives on. next.config.ts rewrites the well-known paths here
// (beforeFiles, so they beat the static file handler):
//
//   /favicon.ico                        -> ?icon=favicon
//   /favicon-16x16.png                  -> ?icon=icon-16
//   /favicon-32x32.png                  -> ?icon=icon-32
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

// For fall-backs reached through a FAILURE (branding unreadable, media host
// down, url rotted) rather than through configuration. The full hour here let
// one slow upstream fetch pin the CDN on a redirect to the Cactus icon for
// sixty minutes, sitewide - a transient blip made permanent-ish. A minute keeps
// the retry pressure off while letting the icon come back with the host.
const TRANSIENT_CACHE_CONTROL = 'public, max-age=60, s-maxage=60'

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
  'icon-16': {
    source: (b) => b.icon16Url,
    fallback: BRANDING_DEFAULTS.favicon16Fallback,
    contentType: 'image/png',
  },
  'icon-32': {
    source: (b) => b.icon32Url,
    fallback: BRANDING_DEFAULTS.favicon32Fallback,
    contentType: 'image/png',
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

  let branding: ResolvedBranding | null = null
  try {
    branding = await resolveBranding()
  } catch {
    // Branding unreadable (mid-setup, database asleep) - the Cactus icon is a
    // better answer than a 500 on a request the browser made on its own.
  }
  if (!branding) return fallback(request, variant, { transient: true })

  // /favicon.ico with the full generated set behind it: answer with a REAL ico
  // - the 16/32/96 PNGs wrapped in an ICO container - rather than bare PNG
  // bytes at a .ico address. The bytes-versus-extension mismatch is what
  // WebKit's icon loader refuses, and it bites every context that asks for
  // /favicon.ico with no document head to offer alternatives (a sitemap tab, a
  // bookmark, a crawler probing the root). Any trouble composing falls through
  // to the single-image path below, exactly as before.
  if (variant === VARIANTS.favicon && branding.faviconUrl) {
    const composed = await composedIco(request, branding)
    if (composed) return composed
  }

  const source = variant.source(branding)

  // No custom icon: hand back the bundled Cactus one. A redirect is right here
  // because the target is a static file on this same origin, so there is no
  // cross-origin fetch to lose and no function to run for the bytes. This one
  // is configuration, not failure, so it keeps the full cache life.
  if (!source) return fallback(request, variant)

  // Every media provider hands back an absolute url, but the field is a plain
  // string and nothing stops a hand-written relative one, which fetch() would
  // throw on.
  let target: URL
  try {
    target = new URL(source, request.url)
  } catch {
    return fallback(request, variant, { transient: true })
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
    if (!upstream.ok || !upstream.body) return fallback(request, variant, { transient: true })

    return new NextResponse(upstream.body, { status: 200, headers: passThrough(upstream, variant) })
  } catch {
    // Media host slow, down, or the url has rotted. A Cactus icon beats a
    // broken tab.
    return fallback(request, variant, { transient: true })
  }
}

// Fetches the favicon renditions and wraps them into one ICO. Null on any
// wobble - a missing rendition, a non-PNG where a PNG should be, a slow host -
// so the caller can carry on with the single-image path.
async function composedIco(request: Request, b: ResolvedBranding): Promise<NextResponse | null> {
  // Without both small renditions there is nothing worth wrapping. And an
  // admin who hand-uploaded a REAL .ico into the favicon box gets it served
  // as-is by the normal path - wrapping an ico in an ico helps nobody.
  if (!b.icon16Url || !b.icon32Url) return null
  if (b.faviconMimeType && !b.faviconMimeType.startsWith('image/png')) return null

  const sources = [b.icon16Url, b.icon32Url, b.faviconUrl].filter((u): u is string => !!u)
  let buffers: Uint8Array[]
  try {
    buffers = await Promise.all(sources.map(async (source) => {
      const upstream = await fetch(new URL(source, request.url), {
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        redirect: 'follow',
        cache: 'no-store',
      })
      if (!upstream.ok) throw new Error(`upstream ${upstream.status}`)
      return new Uint8Array(await upstream.arrayBuffer())
    }))
  } catch {
    return null
  }

  const ico = buildIco(buffers)
  if (!ico) return null

  // Strong ETag from the finished container, checked here rather than
  // forwarded: three upstreams cannot answer one conditional request, and the
  // bytes are already in hand either way.
  const etag = `"${createHash('sha1').update(ico).digest('hex')}"`
  const headers = new Headers()
  headers.set('ETag', etag)
  headers.set('Cache-Control', CACHE_CONTROL)
  headers.set('X-Content-Type-Options', 'nosniff')
  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers })
  }
  headers.set('Content-Type', 'image/x-icon')
  headers.set('Content-Length', String(ico.length))
  return new NextResponse(Buffer.from(ico), { status: 200, headers })
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
  // Only when the upstream sent the bytes plain: fetch() transparently
  // decompresses a content-encoded response, so on a gzipped upstream this
  // header names the COMPRESSED size of a stream that is now decompressed -
  // and a short Content-Length truncates the icon mid-byte.
  const length = upstream.headers.get('content-length')
  if (length && !upstream.headers.get('content-encoding')) headers.set('Content-Length', length)
  headers.set('Cache-Control', CACHE_CONTROL)
  headers.set('X-Content-Type-Options', 'nosniff')
  return headers
}

function fallback(request: Request, variant: Variant, opts: { transient?: boolean } = {}) {
  const res = NextResponse.redirect(new URL(variant.fallback, request.url), 307)
  res.headers.set('Cache-Control', opts.transient ? TRANSIENT_CACHE_CONTROL : CACHE_CONTROL)
  return res
}
