import { cache } from 'react'
import { prisma } from '@/lib/db/prisma'
import { getSiteConfig } from '@/lib/config/site'

// Cactus fall-back assets shipped in /public. Used whenever the admin hasn't
// uploaded a custom equivalent, so a fresh install still has a full icon set.
export const BRANDING_DEFAULTS = {
  faviconSvg: '/favicon.svg',
  faviconPng: '/favicon-96x96.png',
  favIco: '/favicon.ico',
  // Same route, dark variant. Both are on this origin so a tab icon never
  // depends on a cross-origin fetch - see app/api/branding/favicon/route.ts.
  favIcoDark: '/favicon.ico?scheme=dark',
  // The bundled Cactus icon itself. /favicon.ico is a route now (see
  // app/api/branding/favicon/route.ts), so the fall-back file has to sit at an
  // address that route can redirect to without meeting itself coming back.
  favIcoFallback: '/cactus-favicon.ico',
  // Addresses on THIS origin, all three routed to the branding icon route by
  // next.config.ts, for the same reason /favicon.ico is: an icon fetched from
  // the media host queues behind every product image on it. The bundled Cactus
  // files sit at cactus- prefixed names so the route can redirect to them
  // without meeting the rewrite coming back the other way.
  // The typed, sized PNG candidates. A .ico address answering with PNG bytes is
  // what WebKit's icon loader refuses, so these give it something it cannot
  // argue with. Null until the admin re-generates their icon set.
  favicon16: '/favicon-16x16.png',
  favicon16Fallback: '/cactus-favicon-16x16.png',
  favicon32: '/favicon-32x32.png',
  favicon32Fallback: '/cactus-favicon-32x32.png',
  appleTouch: '/apple-touch-icon.png',
  appleTouchFallback: '/cactus-apple-touch-icon.png',
  icon192: '/web-app-manifest-192x192.png',
  icon192Fallback: '/cactus-web-app-manifest-192x192.png',
  icon512: '/web-app-manifest-512x512.png',
  icon512Fallback: '/cactus-web-app-manifest-512x512.png',
  name: 'Cactus Foundation',
  shortName: 'Cactus',
  themeColor: '#ffffff',
  backgroundColor: '#ffffff',
} as const

export type ResolvedBranding = {
  // Custom icon URLs (null => fall back to the Cactus defaults above).
  faviconUrl: string | null
  faviconDarkUrl: string | null
  // Mime types of the two favicon media rows, so the root layout can label the
  // .ico links truthfully (the bytes behind /favicon.ico are whatever the admin
  // uploaded - usually PNG) and the icon route can tell a real hand-uploaded
  // .ico from a PNG it should wrap into one.
  faviconMimeType: string | null
  faviconDarkMimeType: string | null
  icon16Url: string | null
  icon32Url: string | null
  appleTouchUrl: string | null
  icon192Url: string | null
  icon512Url: string | null
  // Effective identity, defaults already applied.
  name: string
  shortName: string
  themeColor: string
  backgroundColor: string
}

const FALLBACK: ResolvedBranding = {
  faviconUrl: null,
  faviconDarkUrl: null,
  faviconMimeType: null,
  faviconDarkMimeType: null,
  icon16Url: null,
  icon32Url: null,
  appleTouchUrl: null,
  icon192Url: null,
  icon512Url: null,
  name: BRANDING_DEFAULTS.name,
  shortName: BRANDING_DEFAULTS.shortName,
  themeColor: BRANDING_DEFAULTS.themeColor,
  backgroundColor: BRANDING_DEFAULTS.backgroundColor,
}

// Resolves the site's icon + app-identity branding, applying Cactus defaults for
// anything the admin hasn't set. Wrapped in React cache() so the root layout's
// generateMetadata/generateViewport and the page render share a single query per
// request. The web-app manifest is a separate request, so it queries once too.
// Best-effort: any DB failure yields the Cactus defaults rather than throwing,
// since this runs in metadata resolution for every route.
export const resolveBranding = cache(async (): Promise<ResolvedBranding> => {
  // Read through the shared cache()d full-row helper rather than a narrow select
  // of its own. SiteConfig is one row of about 5kB, and a public page render
  // used to fetch it four separate times - here, in the public layout, in the
  // menu resolver and in the Puck render metadata - each with a different
  // `select`, which is precisely what stops React's cache() from collapsing
  // them. One shape means one query. Still best-effort: this runs inside
  // metadata resolution for every route, error pages included, so a database
  // blip yields the Cactus defaults rather than a broken page.
  const config = await getSiteConfig().catch(() => null)

  if (!config) return FALLBACK

  // One round-trip resolves every referenced media row to its URL.
  const ids = [
    config.faviconMediaId,
    config.faviconDarkMediaId,
    config.favicon16MediaId,
    config.favicon32MediaId,
    config.appleTouchIconMediaId,
    config.webManifest192MediaId,
    config.webManifest512MediaId,
  ].filter((v): v is string => !!v)

  const byId = new Map<string, { url: string; mimeType: string }>()
  if (ids.length > 0) {
    const rows = await prisma.media
      .findMany({ where: { id: { in: ids } }, select: { id: true, url: true, mimeType: true } })
      .catch(() => [])
    for (const r of rows) byId.set(r.id, { url: r.url, mimeType: r.mimeType })
  }

  const urlOf = (id: string | null) => (id ? byId.get(id)?.url ?? null : null)
  const mimeOf = (id: string | null) => (id ? byId.get(id)?.mimeType ?? null : null)

  const siteName = config.siteName?.trim() || null

  return {
    faviconUrl: urlOf(config.faviconMediaId),
    faviconDarkUrl: urlOf(config.faviconDarkMediaId),
    faviconMimeType: mimeOf(config.faviconMediaId),
    faviconDarkMimeType: mimeOf(config.faviconDarkMediaId),
    icon16Url: urlOf(config.favicon16MediaId),
    icon32Url: urlOf(config.favicon32MediaId),
    appleTouchUrl: urlOf(config.appleTouchIconMediaId),
    icon192Url: urlOf(config.webManifest192MediaId),
    icon512Url: urlOf(config.webManifest512MediaId),
    name: config.appName?.trim() || siteName || BRANDING_DEFAULTS.name,
    shortName: config.appShortName?.trim() || siteName || BRANDING_DEFAULTS.shortName,
    themeColor: config.themeColor?.trim() || BRANDING_DEFAULTS.themeColor,
    backgroundColor: config.backgroundColor?.trim() || BRANDING_DEFAULTS.backgroundColor,
  }
})
