import { NextRequest, NextResponse } from 'next/server'
import {
  GOOGLE_FONTS_FILE_ORIGIN,
  KIT_FONT_FILE_PATH,
  isSafeFontFilePath,
  sanitiseKitFontQuery,
} from '@/lib/design/font-proxy'

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

export async function GET(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params
  const joined = (path ?? []).join('/')
  if (!isSafeFontFilePath(joined)) {
    return new NextResponse('Not a font', { status: 400 })
  }

  // Two shapes of Google url (see KIT_FONT_FILE_PATH). A path one names its type
  // by extension; a kit one has no extension, so its type is read off Google's
  // answer instead - and still only accepted if it is one of the font types above.
  let upstream: string
  let type: string | undefined
  if (joined === KIT_FONT_FILE_PATH) {
    const query = sanitiseKitFontQuery(request.nextUrl.searchParams)
    if (!query) return new NextResponse('Not a font', { status: 400 })
    upstream = `${GOOGLE_FONTS_FILE_ORIGIN}/${KIT_FONT_FILE_PATH}?${query.toString()}`
  } else {
    const ext = joined.split('.').pop()?.toLowerCase() ?? ''
    type = TYPES[ext]
    if (!type) return new NextResponse('Not a font', { status: 400 })
    upstream = `${GOOGLE_FONTS_FILE_ORIGIN}/${joined}`
  }

  try {
    const res = await fetch(upstream, { cache: 'no-store' })
    if (!res.ok) return new NextResponse('Not found', { status: 404 })
    if (!type) {
      const served = res.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? ''
      type = Object.values(TYPES).find((t) => t === served)
      if (!type) return new NextResponse('Not a font', { status: 502 })
    }
    const bytes = await res.arrayBuffer()
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': type,
        'Cache-Control': CACHE,
        // A font is fetched in CORS mode by the browser even from the same origin
        // when the stylesheet that named it came from elsewhere. Same-origin here,
        // but stated so a site serving its CSS from a separate CDN domain keeps
        // working.
        'Access-Control-Allow-Origin': '*',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (err) {
    console.warn(`[fonts] could not proxy ${joined}:`, err)
    return new NextResponse('Upstream unavailable', { status: 502 })
  }
}
