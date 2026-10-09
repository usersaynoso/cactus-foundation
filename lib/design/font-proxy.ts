// Serving Google's webfonts from the site's own domain instead of Google's.
//
// What this replaces: a `<link rel="stylesheet" href="https://fonts.googleapis.com/...">`
// in the document head. That is a render-blocking request to a third party, and on
// the install this was written for it measured **750 ms each, 1.5 seconds for two of
// them** - to fetch 2.8 KB. Preconnects were already in place, so that is not
// connection setup; it is simply what asking Google costs from a browser.
//
// Served from the site's own origin it sits behind whatever CDN the site already
// has (Cloudflare, on the install measured) and answers in tens of milliseconds.
// Two other things fall out of it, and both matter on their own:
//
//   - No request reaches Google from the visitor's browser, so no IP address and
//     no Referer either. On a platform that ships a consent banner, a webfont
//     quietly phoning a third party on every page load is the sort of thing the
//     banner exists to be honest about.
//   - The font FILES come from the same origin too (see the file route), so a
//     second third-party connection disappears with the first.
//
// The address built here is a path on this site, not a url: it has to work from a
// server render with no notion of the site's own host.

/** Where the proxied stylesheet lives. */
export const FONT_CSS_PATH = '/api/fonts/css'

/** Where a proxied font FILE lives - one path segment per segment of Google's own. */
export const FONT_FILE_PATH = '/api/fonts/file'

/** The only upstream this proxy will ever read a stylesheet from. */
export const GOOGLE_FONTS_CSS_ORIGIN = 'https://fonts.googleapis.com'

/** The only upstream the file route will ever read bytes from. */
export const GOOGLE_FONTS_FILE_ORIGIN = 'https://fonts.gstatic.com'

/**
 * A Google Fonts css2 query, narrowed to what a font picker can legitimately ask
 * for, so the route cannot be turned into an open proxy for arbitrary Google urls.
 *
 * `family` may repeat (that is how several typefaces travel in one request) and
 * carries the `Name:wght@400;700` shape. `display` is one of the CSS font-display
 * keywords. Anything else is dropped rather than rejected: a query with a stray
 * parameter should still serve the fonts, not fail the page.
 */
const FAMILY_VALUE = /^[A-Za-z0-9 +_-]+(?::(?:ital,)?(?:wdth,)?wght@[0-9.,;]+)?$/
const DISPLAY_VALUE = /^(?:auto|block|swap|fallback|optional)$/

export function sanitiseFontQuery(params: URLSearchParams): URLSearchParams | null {
  const out = new URLSearchParams()
  const families = params.getAll('family').filter((f) => FAMILY_VALUE.test(f))
  if (families.length === 0) return null
  for (const f of families) out.append('family', f)
  const display = params.get('display')
  out.set('display', display && DISPLAY_VALUE.test(display) ? display : 'swap')
  return out
}

/**
 * Turn Google's stylesheet into one that points at THIS site for its font files.
 *
 * Google's css2 response is a list of `@font-face` blocks whose `src` names a
 * `fonts.gstatic.com` url. Left alone, the stylesheet would come from here and the
 * fonts themselves would still come from Google - half a fix, and the half that
 * leaves the second connection in place.
 *
 * Only that one host is rewritten, and only where it appears as a url: anything
 * else Google chooses to put in the file is passed through untouched.
 */
export function rewriteFontFileUrls(css: string): string {
  return css.replace(
    /https:\/\/fonts\.gstatic\.com\/([^)"'\s]+)/g,
    (_all, path: string) => `${FONT_FILE_PATH}/${path}`,
  )
}

/**
 * Whether a path is one this proxy will fetch from Google's font host.
 *
 * Deliberately a shape test rather than an allow-list of families: Google mints
 * these paths and they change with every font revision. What it does refuse is
 * anything that could climb out of the font tree or name a different host - a
 * leading slash, a `..`, a protocol, a backslash.
 */
export function isSafeFontFilePath(path: string): boolean {
  if (!path || path.length > 300) return false
  if (path.startsWith('/') || path.includes('..') || path.includes('\\')) return false
  if (path.includes('://') || path.includes('@')) return false
  return /^[A-Za-z0-9/._-]+$/.test(path)
}

/**
 * Google's second shape of font-file url: `fonts.gstatic.com/l/font?kit=…&skey=…&v=…`.
 *
 * Most answers name files by path (`/s/inter/v20/….woff2`), but Google sometimes
 * answers the very same css2 query with this one instead - the file is identified
 * by the query string and the path carries no extension at all. Which shape comes
 * back is Google's choice, varies by where the request comes from, and is not
 * something a site can ask for. Learned 2026-10-09: a fresh deployment's cold
 * instance got this shape, every face 400'd as "Not a font", and the whole site
 * fell back to system fonts until the deployment was rolled back.
 */
export const KIT_FONT_FILE_PATH = 'l/font'

const KIT_PARAM_VALUE = /^[A-Za-z0-9_-]{1,200}$/

/**
 * The query of a kit-shaped font url, narrowed to the three parameters Google
 * puts there, or null if `kit` is missing or anything looks off. Rebuilt rather
 * than forwarded, so the request cannot carry anything else to Google.
 */
export function sanitiseKitFontQuery(params: URLSearchParams): URLSearchParams | null {
  const out = new URLSearchParams()
  for (const name of ['kit', 'skey', 'v'] as const) {
    const value = params.get(name)
    if (value === null) continue
    if (!KIT_PARAM_VALUE.test(value)) return null
    out.set(name, value)
  }
  return out.has('kit') ? out : null
}

/** The site-relative address of the proxied stylesheet for a sanitised query. */
export function proxiedFontHref(params: URLSearchParams): string {
  return `${FONT_CSS_PATH}?${params.toString()}`
}
