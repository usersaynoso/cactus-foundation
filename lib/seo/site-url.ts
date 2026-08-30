// The site's public origin, resolved in ONE place.
//
// robots.ts, sitemap.ts, the public layout and every canonical URL need the
// same answer, and three of them used to work it out with their own copy of the
// same expression. A copy that drifts is how a site ends up advertising a
// canonical on one host and a sitemap on another, which search engines treat as
// two sites competing with each other.
export function resolveSiteUrl(): string | null {
  const explicit = process.env.SITE_URL?.trim()
  const vercel = process.env.VERCEL_URL?.trim()
  const raw = explicit || (vercel ? `https://${vercel}` : '')
  if (!raw) return null

  // SITE_URL is admin-entered, so it may arrive without a scheme or with a
  // trailing slash, a path, or both. Only the origin is ever wanted.
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const url = new URL(withScheme)
    return `${url.protocol}//${url.host}`
  } catch {
    return null
  }
}
