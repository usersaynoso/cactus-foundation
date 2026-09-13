import { NextRequest, NextResponse } from 'next/server'
import { GOOGLE_FONTS_CSS_ORIGIN, sanitiseFontQuery } from '@/lib/design/font-proxy'
import { fetchProxiedFontCss, holdFontFaceCss } from '@/lib/design/font-face-css'

// The site's own copy of a Google Fonts stylesheet. See lib/design/font-proxy.ts
// for why this exists at all - the short version is 750 ms per third-party
// stylesheet, twice, on every cold render of the page.

// The upstream request itself - the fixed User-Agent and the url rewrite - lives in
// lib/design/font-face-css.ts, shared with the public layout, which writes the same
// rules straight into the page once it holds them.

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
    const css = await fetchProxiedFontCss(params)
    // Having paid for the request, keep the answer where a page render on this
    // instance can inline it rather than link to it. Memory only, and a no-op for
    // anything that fails the inline checks.
    holdFontFaceCss(params, css)

    return new NextResponse(css, {
      headers: {
        'Content-Type': 'text/css; charset=utf-8',
        'Cache-Control': CACHE,
        // The stylesheet is the same for everybody (see FONT_UPSTREAM_USER_AGENT), so say so
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
