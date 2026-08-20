import { NextResponse } from 'next/server'
import { resolveBranding, BRANDING_DEFAULTS } from '@/lib/config/branding'

// /favicon.ico, served from the admin's Appearance branding rather than from a
// file baked into the build. next.config.ts rewrites the well-known path here
// (beforeFiles, so it beats the static file handler).
//
// Why it has to be a route at all: the <link rel="icon"> tags the root layout
// emits only reach responses that HAVE a document head. /sitemap.xml,
// /robots.txt, a JSON API response, a downloaded file - none of them carry one,
// so the browser falls back to the origin's /favicon.ico and, before this,
// found the bundled Cactus icon sat there. A site with its own favicon then
// showed somebody else's logo on its own sitemap, which is the sort of thing an
// owner notices.
//
// Answers with a redirect rather than the bytes: a custom favicon lives with
// the site's media provider (often a CDN), and proxying it through here would
// buy a second hop for every request and nothing else.
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  let target: string = BRANDING_DEFAULTS.favIcoFallback
  try {
    const branding = await resolveBranding()
    if (branding.faviconUrl) target = branding.faviconUrl
  } catch {
    // Branding unreadable (mid-setup, database asleep) - the Cactus icon is a
    // better answer than a 500 on a request the browser made on its own.
  }
  const res = NextResponse.redirect(new URL(target, request.url), 307)
  // Short enough that changing the favicon in Appearance shows up the same day,
  // long enough that a tab icon is not a database read per page view.
  res.headers.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
  return res
}
