import { NextRequest, NextResponse } from 'next/server'
import { GOOGLE_FONTS_FILE_ORIGIN, isSafeFontFilePath } from '@/lib/design/font-proxy'

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

  const ext = joined.split('.').pop()?.toLowerCase() ?? ''
  const type = TYPES[ext]
  if (!type) return new NextResponse('Not a font', { status: 400 })

  try {
    const res = await fetch(`${GOOGLE_FONTS_FILE_ORIGIN}/${joined}`, { cache: 'no-store' })
    if (!res.ok) return new NextResponse('Not found', { status: 404 })
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
