import type { MetadataRoute } from 'next'

// XML-escaping for sitemap URLs.
//
// Next builds sitemap.xml by interpolating each entry's `url` straight into
// `<loc>${item.url}</loc>` with no escaping of its own (see
// next/dist/build/webpack/loaders/metadata/resolve-route-data.js). The sitemap
// protocol requires entity-escaping in `<loc>`, and any URL carrying a query
// string carries a raw `&` - which is not a character in XML, it is the start of
// an entity reference. One such URL and the parser stops dead at that line,
// taking the whole file with it: every page listed after it is simply not read.
//
// That is what shop-variations' per-combination product URLs did the first time
// they shipped ("EntityRef: expecting ';'" at the first `?a=b&c=d` entry, on a
// 5 MB file where everything below it was lost).
//
// Escaping happens HERE, in the one funnel every entry passes through, rather
// than in each module: a module writing its own URLs should not have to know how
// Next serialises them, and the next module to publish a query string would
// otherwise repeat the same fault. The corollary is that a module must hand this
// its URLs RAW - anything pre-escaped would come out double-escaped.
const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
}

export function escapeSitemapUrl(url: string): string {
  return url.replace(/[&<>"']/g, (char) => XML_ESCAPES[char] as string)
}

/** Every URL in a sitemap, escaped for the XML it is about to be pasted into. */
export function escapeSitemapEntries(entries: MetadataRoute.Sitemap): MetadataRoute.Sitemap {
  return entries.map((entry) => {
    const languages = entry.alternates?.languages
    return {
      ...entry,
      url: escapeSitemapUrl(entry.url),
      ...(languages
        ? {
            alternates: {
              ...entry.alternates,
              languages: Object.fromEntries(
                Object.entries(languages).map(([lang, href]) => [lang, typeof href === 'string' ? escapeSitemapUrl(href) : href]),
              ) as typeof languages,
            },
          }
        : {}),
    }
  })
}
