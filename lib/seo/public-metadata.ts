import type { Metadata } from 'next'

// Canonical URLs, og:url, og:title, og:description, og:site_name and the
// Twitter card, filled in for every public page that did not set them itself.
//
// None of this existed. The site audit crawler has been reporting "No canonical
// link tag" on every page it visits since the day it was written, and it was
// right: a page reachable at /thing, /thing?utm_source=…, /thing?ref=… and the
// bare domain (when it is the homepage) looked like four pages to a crawler,
// splitting whatever authority it had four ways.

/** Join path segments into the form a canonical URL should carry: /a/b, or / for the root. */
export function canonicalPath(...segments: Array<string | string[] | undefined>): string {
  const parts = segments
    .flat()
    .flatMap((s) => (s ?? '').split('/'))
    .map((s) => s.trim())
    .filter(Boolean)
  return parts.length ? `/${parts.join('/')}` : '/'
}

type OpenGraphBag = Record<string, unknown>
type TwitterBag = Record<string, unknown>

/**
 * Fill in the discovery tags a page left blank, without overwriting anything it
 * set deliberately - a module page that publishes its own og:type of 'article'
 * or its own canonical (a paginated listing pointing at page one, say) keeps it.
 *
 * Next replaces `openGraph` and `twitter` wholesale rather than deep-merging
 * them across layouts, so a parent-layout default is wiped by any page that
 * sets one field of its own. Defaults therefore have to be applied per page,
 * here, rather than once in the root layout.
 */
export function withPublicSeo(meta: Metadata, path: string, siteName?: string): Metadata {
  const canonical = meta.alternates?.canonical ?? path
  const title = typeof meta.title === 'string' ? meta.title : undefined
  const description = typeof meta.description === 'string' ? meta.description : undefined

  // Cast: Metadata['openGraph'] is a discriminated union keyed on `type`, which
  // cannot be spread and re-narrowed. The bag is written back under the same
  // type, so the only thing given up is compile-time checking of a shape this
  // function does not invent - every value below comes from `meta` itself.
  const og = (meta.openGraph ?? {}) as OpenGraphBag
  const tw = (meta.twitter ?? {}) as TwitterBag

  return {
    ...meta,
    alternates: { ...meta.alternates, canonical },
    openGraph: {
      type: 'website',
      ...og,
      url: og.url ?? canonical,
      ...(og.title === undefined && title !== undefined ? { title } : {}),
      ...(og.description === undefined && description !== undefined ? { description } : {}),
      ...(og.siteName === undefined && siteName ? { siteName } : {}),
    } as Metadata['openGraph'],
    twitter: {
      card: 'summary_large_image',
      ...tw,
      ...(tw.title === undefined && title !== undefined ? { title } : {}),
      ...(tw.description === undefined && description !== undefined ? { description } : {}),
    } as Metadata['twitter'],
  }
}
