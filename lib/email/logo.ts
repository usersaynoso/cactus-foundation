// Which picture an email can actually show, and where to point it.
//
// Mail clients are not browsers. Gmail drops SVG images on the floor and
// Outlook's Word-based renderer has never heard of WebP, which is awkward,
// because a designer hands over an SVG and the media optimiser turns nearly
// everything else into WebP. The site logo therefore arrives as a hole at the
// top of every email while looking perfectly fine on the site itself.
//
// PNG, JPEG and GIF are the three every client of consequence renders. A logo
// already in one of those is used exactly as it stands: no extra hop, no
// rendering, and the site's own CDN still serves it. Anything else is pointed
// at /api/branding/email-logo, which prints a PNG of it.

export const EMAIL_SAFE_IMAGE_TYPES: ReadonlySet<string> = new Set(['image/png', 'image/jpeg', 'image/gif'])

/** What the site logo looks like to the code here: enough to decide, no more. */
export type EmailLogoSource = { id: string; url: string; mimeType: string }

/** Absolute form of a media URL. An email is read somewhere else entirely, so a
 *  site-relative src is a broken image by definition. */
export function absolutiseUrl(url: string | null | undefined, siteUrl: string): string {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('/')) return `${siteUrl.replace(/\/$/, '')}${url}`
  return url
}

/** The rendering endpoint for one logo, stamped with the media id. A new logo is
 *  a new id and so a new URL, which is what stops a mail proxy that has cached
 *  the picture for a year from serving last season's brand. */
export function emailLogoEndpoint(siteUrl: string, mediaId: string): string {
  return `${siteUrl.replace(/\/$/, '')}/api/branding/email-logo?v=${encodeURIComponent(mediaId)}`
}

/** The src an email should carry for the site logo. */
export function emailLogoUrl(logo: EmailLogoSource | null | undefined, siteUrl: string): string {
  if (!logo?.url) return ''
  if (EMAIL_SAFE_IMAGE_TYPES.has(logo.mimeType)) return absolutiseUrl(logo.url, siteUrl)
  // No site address to build an absolute endpoint from (SITE_URL unset, which
  // is a misconfigured install rather than a normal one): the media URL is
  // usually a CDN address and is at least worth a try, where the endpoint would
  // resolve to nothing at all.
  if (!siteUrl) return absolutiseUrl(logo.url, siteUrl)
  return emailLogoEndpoint(siteUrl, logo.id)
}
