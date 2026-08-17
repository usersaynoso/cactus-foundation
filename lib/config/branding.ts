import { cache } from 'react'
import { prisma } from '@/lib/db/prisma'

// Cactus fall-back assets shipped in /public. Used whenever the admin hasn't
// uploaded a custom equivalent, so a fresh install still has a full icon set.
export const BRANDING_DEFAULTS = {
  faviconSvg: '/favicon.svg',
  faviconPng: '/favicon-96x96.png',
  favIco: '/favicon.ico',
  appleTouch: '/apple-touch-icon.png',
  icon192: '/web-app-manifest-192x192.png',
  icon512: '/web-app-manifest-512x512.png',
  name: 'Cactus Foundation',
  shortName: 'Cactus',
  themeColor: '#ffffff',
  backgroundColor: '#ffffff',
} as const

export type ResolvedBranding = {
  // Custom icon URLs (null => fall back to the Cactus defaults above).
  faviconUrl: string | null
  faviconDarkUrl: string | null
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
  const config = await prisma.siteConfig
    .findUnique({
      where: { id: 'singleton' },
      select: {
        siteName: true,
        faviconMediaId: true,
        faviconDarkMediaId: true,
        appleTouchIconMediaId: true,
        webManifest192MediaId: true,
        webManifest512MediaId: true,
        appName: true,
        appShortName: true,
        themeColor: true,
        backgroundColor: true,
      },
    })
    .catch(() => null)

  if (!config) return FALLBACK

  // One round-trip resolves every referenced media row to its URL.
  const ids = [
    config.faviconMediaId,
    config.faviconDarkMediaId,
    config.appleTouchIconMediaId,
    config.webManifest192MediaId,
    config.webManifest512MediaId,
  ].filter((v): v is string => !!v)

  const urlById = new Map<string, string>()
  if (ids.length > 0) {
    const rows = await prisma.media
      .findMany({ where: { id: { in: ids } }, select: { id: true, url: true } })
      .catch(() => [])
    for (const r of rows) urlById.set(r.id, r.url)
  }

  const urlOf = (id: string | null) => (id ? urlById.get(id) ?? null : null)

  const siteName = config.siteName?.trim() || null

  return {
    faviconUrl: urlOf(config.faviconMediaId),
    faviconDarkUrl: urlOf(config.faviconDarkMediaId),
    appleTouchUrl: urlOf(config.appleTouchIconMediaId),
    icon192Url: urlOf(config.webManifest192MediaId),
    icon512Url: urlOf(config.webManifest512MediaId),
    name: config.appName?.trim() || siteName || BRANDING_DEFAULTS.name,
    shortName: config.appShortName?.trim() || siteName || BRANDING_DEFAULTS.shortName,
    themeColor: config.themeColor?.trim() || BRANDING_DEFAULTS.themeColor,
    backgroundColor: config.backgroundColor?.trim() || BRANDING_DEFAULTS.backgroundColor,
  }
})
