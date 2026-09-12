import { NextRequest, NextResponse } from 'next/server'
import {
  GOOGLE_FONTS_CSS_ORIGIN,
  rewriteFontFileUrls,
  sanitiseFontQuery,
} from '@/lib/design/font-proxy'

// The site's own copy of a Google Fonts stylesheet. See lib/design/font-proxy.ts
// for why this exists at all - the short version is 750 ms per third-party
// stylesheet, twice, on every cold render of the page.

// A fixed, modern User-Agent rather than the visitor's own. Google varies this
// response by user agent, handing older browsers `woff` and newer ones `woff2`, so
// forwarding the real one would mean a separate cached copy per browser build -
// dozens of variants of a file that is otherwise identical. woff2 has been
// supported everywhere that matters since 2015, so one answer serves everybody and
// caches as one object.
const UPSTREAM_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

// A year. The font-file urls inside carry Google's own revision hashes, so a
// stylesheet that changes changes its contents rather than its meaning, and a
// stale-while-revalidate window means nobody ever waits for the refresh.
const CACHE = 'public, max-age=31536000, s-maxage=31536000, stale-while-revalidate=86400, immutable'

export async function GET(request: NextRequest) {
  const params = sanitiseFontQuery(request.nextUrl.searchParams)
  if (!params) {
    return new NextResponse('No font family asked for', { status: 400 })
  }

  const upstream = `${GOOGLE_FONTS_CSS_ORIGIN}/css2?${params.toString()}`

  try {
    const res = await fetch(upstream, {
      headers: { 'User-Agent': UPSTREAM_UA, Accept: 'text/css,*/*;q=0.1' },
      // Next's own fetch cache would hold this too, but the response is already
      // cached hard downstream and the upstream is the thing we are trying not to
      // depend on - so no revalidation window is claimed here.
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`upstream ${res.status}`)
    const css = await res.text()
    if (!css.includes('@font-face')) throw new Error('upstream returned no font faces')

    return new NextResponse(rewriteFontFileUrls(css), {
      headers: {
        'Content-Type': 'text/css; charset=utf-8',
        'Cache-Control': CACHE,
        // The stylesheet is the same for everybody (see UPSTREAM_UA), so say so
        // rather than letting a cache guess.
        Vary: 'Accept-Encoding',
      },
    })
  } catch (err) {
    // Google unreachable from wherever this is deployed. Falling back to a redirect
    // rather than an error: the browser then fetches the stylesheet itself, exactly
    // as it did before this route existed, so the page keeps its typeface and loses
    // only the speed. A site with no fonts because a proxy had a bad minute would be
    // a far worse trade than a slow one.
    console.warn('[fonts] could not proxy the stylesheet, sending the browser to Google:', err)
    return NextResponse.redirect(upstream, {
      status: 302,
      headers: { 'Cache-Control': 'public, max-age=60' },
    })
  }
}
