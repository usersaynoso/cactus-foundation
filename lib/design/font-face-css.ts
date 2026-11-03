// The site's font stylesheet, held in memory so a page can carry it inline.
//
// WHY. The public layout used to name the proxied stylesheet with a
// `<link rel="stylesheet">`. React leaves a stylesheet with no `precedence` where
// it was rendered, which in that layout is the top of <body> - so the header and
// everything under it waited on a round trip for 28 `@font-face` rules before a
// single pixel was drawn. The rules are about 10 KB of text (under 1 KB
// compressed), they only change when Google revises a typeface, and the server
// that renders the page is the same code that builds them for the stylesheet
// route. Writing them straight into the page removes the wait for every first
// visit and costs a couple of kilobytes of HTML.
//
// WHAT IT MUST NEVER DO is make a page render wait on Google, or ask Google on
// every request. So the render only ever READS memory, synchronously. A cold
// instance renders the old `<link>` and asks for a refresh to run after the
// response has gone (`after()` in the layout); the next render on that instance
// finds the text and inlines it. One upstream request per instance per day at
// most, deduplicated while it is in flight, and a failure backs off for a while
// rather than turning into a request per page view.
//
// Plain module state rather than Next's data cache on purpose: the data cache is
// itself a network hop, and the whole point is that reading this costs nothing.

import { z } from 'zod'
import {
  FONT_CSS_PATH,
  FONT_FILE_PATH,
  GOOGLE_FONTS_CSS_ORIGIN,
  rewriteFontFileUrls,
  sanitiseFontQuery,
} from '@/lib/design/font-proxy'
import { fetchWithRetry, putFontCache } from '@/lib/design/font-cache'

// A fixed, modern User-Agent rather than the visitor's own. Google varies this
// response by user agent, handing older browsers `woff` and newer ones `woff2`, so
// forwarding the real one would mean a separate cached copy per browser build -
// dozens of variants of a file that is otherwise identical. woff2 has been
// supported everywhere that matters since 2015, so one answer serves everybody and
// caches as one object.
export const FONT_UPSTREAM_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/** How long a held stylesheet is served before a background refresh is asked for. */
export const FONT_FACES_FRESH_FOR_MS = 24 * 60 * 60 * 1000

/** How long to leave Google alone after a refresh failed, so an outage costs one request per window, not one per page. */
export const FONT_FACES_RETRY_AFTER_MS = 10 * 60 * 1000

// A site asks for one stylesheet; a handful covers a design being edited. The cap
// only exists so a stream of odd queries through the stylesheet route cannot grow
// this without limit.
const MAX_HELD_STYLESHEETS = 16

// Google's css2 answer for four families at four weights is under 20 KB. Anything
// several times that is not a font stylesheet and has no business in every page.
const MAX_INLINE_BYTES = 64 * 1024

/** Every `url(...)` the stylesheet names, quotes stripped. */
function urlsIn(css: string): string[] {
  return [...css.matchAll(/url\(\s*['"]?([^'")\s]+)/g)].map((match) => match[1] ?? '')
}

/**
 * What a stylesheet has to look like before it is written into the page.
 *
 * It comes from Google, so it is external input like any other, and inlining
 * raises the stakes over linking it: a `<` could close the <style> element and
 * start markup, and a url anywhere other than this site's font route would have
 * the visitor's browser fetch something the stylesheet route was built to keep it
 * away from. Any doubt, and the page simply links the stylesheet as before.
 */
export const inlineFontFaceCssSchema = z
  .string()
  .max(MAX_INLINE_BYTES)
  .refine((css) => css.includes('@font-face'), 'names no font faces')
  .refine((css) => !css.includes('<'), 'contains a "<", which could end the <style> element')
  .refine((css) => !/@import/i.test(css), 'imports another stylesheet')
  .refine(
    (css) => urlsIn(css).every((url) => url.startsWith(`${FONT_FILE_PATH}/`)),
    'names a url outside the font file route',
  )

/** The cache key a stylesheet's last-known-good copy is kept under. */
export function fontCssCacheKey(params: URLSearchParams): string {
  return `css:${params.toString()}`
}

/**
 * Fetch Google's stylesheet for a sanitised query and point its font files at this
 * site. Throws on anything that is not a real stylesheet, so each caller decides
 * its own fallback: the stylesheet route serves its last good copy (then
 * redirects to Google), the page links.
 *
 * Timed out and retried once on the failures that are worth retrying (see
 * fetchWithRetry): a request that hangs used to hang the stylesheet with it, and
 * the page waited on it until the browser gave up and drew system fonts.
 *
 * A stylesheet that would still send the browser to Google for a file - a font
 * url this rewrite did not recognise - is refused too: it would pass every other
 * check, get cached for days at the edge, and fail on any network that cannot
 * reach Google.
 */
export async function fetchProxiedFontCss(params: URLSearchParams, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchWithRetry(
    `${GOOGLE_FONTS_CSS_ORIGIN}/css2?${params.toString()}`,
    {
      headers: { 'User-Agent': FONT_UPSTREAM_USER_AGENT, Accept: 'text/css,*/*;q=0.1' },
      // Next's own fetch cache would hold this too, but the response is already
      // cached hard downstream and in memory here, and the upstream is the thing we
      // are trying not to depend on - so no revalidation window is claimed.
      cache: 'no-store',
    },
    fetchImpl,
    // Shorter than a font file's: the stylesheet blocks the page that links it.
    { timeoutMs: 5000 },
  )
  if (!res.ok) throw new Error(`upstream ${res.status}`)
  const css = await res.text()
  if (!css.includes('@font-face')) throw new Error('upstream returned no font faces')
  const rewritten = rewriteFontFileUrls(css)
  if (/fonts\.gstatic\.com/.test(rewritten)) throw new Error('upstream named a font file this proxy cannot rewrite')
  putFontCache(fontCssCacheKey(params), rewritten)
  return rewritten
}

type HeldStylesheet = { css: string; fetchedAt: number }

const held = new Map<string, HeldStylesheet>()
const lastAttemptAt = new Map<string, number>()
const inFlight = new Map<string, Promise<void>>()

/**
 * The memory key for a stylesheet address the layout built, or null if it is not
 * one of this site's proxied stylesheets. Re-sanitised rather than trusted, so the
 * key is the exact query the upstream request would carry.
 */
export function fontFacesKeyForHref(href: string): string | null {
  const prefix = `${FONT_CSS_PATH}?`
  if (!href.startsWith(prefix)) return null
  const params = sanitiseFontQuery(new URLSearchParams(href.slice(prefix.length)))
  return params ? params.toString() : null
}

/**
 * Hold a stylesheet for inlining. Returns false, and holds nothing, when it fails
 * the inline checks - the caller's own copy is unaffected.
 */
export function holdFontFaceCss(params: URLSearchParams, css: string, now: number = Date.now()): boolean {
  if (!inlineFontFaceCssSchema.safeParse(css).success) return false
  const key = params.toString()
  // Re-inserted so the Map's insertion order doubles as least-recently-written.
  held.delete(key)
  held.set(key, { css, fetchedAt: now })
  while (held.size > MAX_HELD_STYLESHEETS) {
    const oldest = held.keys().next().value
    if (oldest === undefined) break
    held.delete(oldest)
  }
  return true
}

/** What the layout needs to know about one stylesheet at render time. */
export type InlineFontFaces = {
  /** The rules to write into the page, or null to link the stylesheet instead. */
  css: string | null
  /** Whether a background refresh should be asked for after this response. */
  needsRefresh: boolean
}

/**
 * Synchronous and free: memory only, never the network. A stale copy is still
 * served - it names files Google keeps for years - and flagged for a refresh.
 */
export function readInlineFontFaces(href: string, now: number = Date.now()): InlineFontFaces {
  const key = fontFacesKeyForHref(href)
  if (!key) return { css: null, needsRefresh: false }
  const entry = held.get(key)
  const stale = !entry || now - entry.fetchedAt > FONT_FACES_FRESH_FOR_MS
  const attempted = lastAttemptAt.get(key)
  const backingOff = attempted !== undefined && now - attempted < FONT_FACES_RETRY_AFTER_MS
  return { css: entry?.css ?? null, needsRefresh: stale && !backingOff && !inFlight.has(key) }
}

/**
 * Fetch and hold one stylesheet. Never throws, and concurrent callers share one
 * request. Meant to run after the response (the layout hands it to `after()`).
 */
export function refreshInlineFontFaces(
  href: string,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<void> {
  const key = fontFacesKeyForHref(href)
  if (!key) return Promise.resolve()
  const pending = inFlight.get(key)
  if (pending) return pending
  lastAttemptAt.set(key, now())
  const params = new URLSearchParams(key)
  const job = fetchProxiedFontCss(params, fetchImpl)
    .then((css) => {
      if (!holdFontFaceCss(params, css, now())) {
        console.warn('[fonts] the stylesheet did not pass the inline checks, so pages keep linking it')
      }
    })
    .catch((err: unknown) => {
      console.warn('[fonts] could not refresh the inline stylesheet, pages keep linking it:', err)
    })
    .finally(() => {
      inFlight.delete(key)
    })
  inFlight.set(key, job)
  return job
}
