import { NextRequest, NextResponse, after } from 'next/server'
import { GOOGLE_FONTS_CSS_ORIGIN, sanitiseFontQuery } from '@/lib/design/font-proxy'
import { fetchProxiedFontCss, fontCssCacheKey, holdFontFaceCss } from '@/lib/design/font-face-css'
import { getFontCache } from '@/lib/design/font-cache'

// The site's own copy of a Google Fonts stylesheet. See lib/design/font-proxy.ts
// for why this exists at all - the short version is 750 ms per third-party
// stylesheet, twice, on every cold render of the page.

// The upstream request itself - the fixed User-Agent and the url rewrite - lives in
// lib/design/font-face-css.ts, shared with the public layout, which writes the same
// rules straight into the page once it holds them.

// A day in the browser, a week at the edge, and a month of stale-while-
// revalidate so nobody ever waits on the refresh. It used to be a year and
// immutable, which was the right call for the font FILES (content-addressed) and
// the wrong one for the stylesheet: it is Google's answer at one moment, it can
// name kit-shaped urls Google later retires, and a poor answer cached for a year
// is a year of the wrong fonts with no way to take it back short of a purge.
const CACHE = 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000'

const REFRESH_EVERY_MS = 60 * 60 * 1000
const lastRefreshAt = new Map<string, number>()

export async function GET(request: NextRequest) {
  const params = sanitiseFontQuery(request.nextUrl.searchParams)
  if (!params) {
    return new NextResponse('No font family asked for', { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }

  const upstream = `${GOOGLE_FONTS_CSS_ORIGIN}/css2?${params.toString()}`
  const key = fontCssCacheKey(params)

  // A copy already held on this server answers at once, and Google is asked
  // afterwards, at most once an hour per stylesheet, off the visitor's critical
  // path. Linking pages block on this stylesheet: they used to wait on Google
  // (up to two timed-out attempts) even when the answer was sitting on disk.
  const held = getFontCache(key)
  if (held) {
    const last = lastRefreshAt.get(key) ?? 0
    if (Date.now() - last > REFRESH_EVERY_MS) {
      lastRefreshAt.set(key, Date.now())
      const refresh = async () => {
        try {
          holdFontFaceCss(params, await fetchProxiedFontCss(params))
        } catch (err) {
          console.warn('[fonts] background refresh of the stylesheet failed, keeping the held copy:', err)
        }
      }
      try {
        after(refresh)
      } catch {
        // Outside a request (a test, a script): nothing to run it after.
      }
    }
    return new NextResponse(new Uint8Array(held), {
      headers: { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': CACHE, Vary: 'Accept-Encoding' },
    })
  }

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
    // Nothing held on this server (a held copy is served above, before Google is
    // asked at all): fall back to a redirect rather than an error. The browser then
    // fetches the stylesheet itself, exactly as it did before this route existed,
    // so the page keeps its typeface and loses only the speed. A site with no
    // fonts because a proxy had a bad minute would be a far worse trade than a
    // slow one.
    console.warn('[fonts] could not proxy the stylesheet, sending the browser to Google:', err)
    return NextResponse.redirect(upstream, {
      status: 302,
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' },
    })
  }
}
