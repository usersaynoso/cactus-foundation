import { NextRequest, NextResponse } from 'next/server'
import {
  GOOGLE_FONTS_FILE_ORIGIN,
  KIT_FONT_FILE_PATH,
  isSafeFontFilePath,
  sniffFontType,
  sanitiseKitFontQuery,
} from '@/lib/design/font-proxy'
import { fetchWithRetry, getFontCache, putFontCache } from '@/lib/design/font-cache'

// The font FILES, from this site's origin rather than Google's.
//
// Proxying only the stylesheet would be half a fix: the browser would take the CSS
// from here and then open a second connection to fonts.gstatic.com for every face
// in it. The stylesheet route rewrites those urls to point here, and this is what
// answers them.
//
// The path is reconstructed against ONE hard-coded origin and nothing about the
// request can change that - see isSafeFontFilePath for what is refused. An open
// proxy is the obvious way to get this wrong, and the shape of these paths (minted
// by Google, changing with every font revision) rules out an allow-list.

// A year, immutable. Google's font paths carry a revision hash, so a given path is
// the same bytes forever - which is exactly what immutable is for, and it means a
// returning visitor fetches no fonts at all.
const CACHE = 'public, max-age=31536000, immutable'

// Only what Google actually serves here. A stylesheet asking for anything else has
// been tampered with, and guessing a Content-Type from the extension is how a proxy
// ends up serving something executable from the site's own origin.
const TYPES: Record<string, string> = {
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  otf: 'font/otf',
}

// Errors are never cached anywhere. A font file that failed once must be asked
// for again by the very next page: left without a Cache-Control, a CDN applies
// its own default to a 404 on a .woff2 address (minutes, at Cloudflare), and
// every visitor through that edge drew system fonts until it ran out.
const NO_STORE = { 'Cache-Control': 'no-store' }

// Concurrent first requests for the same file (every face on a cold page, many
// visitors at once) share one upstream fetch.
const inFlight = new Map<string, Promise<{ bytes: Buffer; type: string } | null>>()

function fontResponse(bytes: Buffer, type: string): NextResponse {
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': type,
      'Content-Length': String(bytes.length),
      'Cache-Control': CACHE,
      // A font is fetched in CORS mode by the browser even from the same origin
      // when the stylesheet that named it came from elsewhere. Same-origin here,
      // but stated so a site serving its CSS from a separate CDN domain keeps
      // working.
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

// Fetch, check it really is a font, keep a copy. Null when Google's answer was
// not a font (or not there); throws when Google could not be reached at all.
async function fetchFont(upstream: string): Promise<{ bytes: Buffer; type: string } | null> {
  const res = await fetchWithRetry(upstream, { cache: 'no-store' })
  if (!res.ok) return null
  const bytes = Buffer.from(await res.arrayBuffer())
  // Always read off the file's own first bytes, whichever shape of url. Google
  // mislabels kit files as text/html from some networks (seen from an OVH UK
  // server) while the body is a real WOFF2 - and the reverse, a 200 whose body is
  // an error page, would otherwise be served as font/woff2 with a year's
  // immutable cache in every browser and at the edge. A font signature is the
  // only thing accepted, so HTML can never be served from this origin.
  const sniffed = sniffFontType(bytes.subarray(0, 4))
  if (!sniffed) return null
  // The bytes win over the extension if they disagree: a .woff2 address answering
  // WOFF is still a font the browser can use, and the label should say so.
  return { bytes, type: sniffed }
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params
  const joined = (path ?? []).join('/')
  if (!isSafeFontFilePath(joined)) {
    return new NextResponse('Not a font', { status: 400, headers: NO_STORE })
  }

  // Two shapes of Google url (see KIT_FONT_FILE_PATH). A path one names its type
  // by extension; a kit one has no extension, so its type is read off the bytes.
  let upstream: string
  if (joined === KIT_FONT_FILE_PATH) {
    const query = sanitiseKitFontQuery(request.nextUrl.searchParams)
    if (!query) return new NextResponse('Not a font', { status: 400, headers: NO_STORE })
    upstream = `${GOOGLE_FONTS_FILE_ORIGIN}/${KIT_FONT_FILE_PATH}?${query.toString()}`
  } else {
    const ext = joined.split('.').pop()?.toLowerCase() ?? ''
    if (!TYPES[ext]) return new NextResponse('Not a font', { status: 400, headers: NO_STORE })
    upstream = `${GOOGLE_FONTS_FILE_ORIGIN}/${joined}`
  }

  // Google's font addresses are content-addressed, so a copy we already hold is
  // the right answer forever - no need to ask Google at all.
  const cacheKey = `file:${upstream}`
  const held = getFontCache(cacheKey)
  if (held) {
    const type = sniffFontType(held.subarray(0, 4))
    if (type) return fontResponse(held, type)
  }

  let job = inFlight.get(upstream)
  if (!job) {
    job = fetchFont(upstream).finally(() => inFlight.delete(upstream))
    inFlight.set(upstream, job)
  }

  try {
    const font = await job
    if (!font) return new NextResponse('Not a font', { status: 502, headers: NO_STORE })
    putFontCache(cacheKey, font.bytes)
    return fontResponse(font.bytes, font.type)
  } catch (err) {
    console.warn(`[fonts] could not proxy ${joined}:`, err)
    return new NextResponse('Upstream unavailable', { status: 502, headers: { ...NO_STORE, 'Retry-After': '5' } })
  }
}
