import { cache } from 'react'
import { createHash } from 'crypto'
import type { MediaProviderType } from '@prisma/client'
import type { IconSlot } from '@/lib/config/favicon-variants'
import { prisma } from '@/lib/db/prisma'
import { getSiteConfig } from '@/lib/config/site'

// Every icon address the site advertises. All of them are rewritten by
// next.config.ts to the icon route (app/api/branding/favicon/[[...variant]]),
// which draws the site's own icon at exactly the format and size the name
// promises - see lib/config/favicon-variants.ts. The bundled Cactus files sit at
// cactus- prefixed names so the route can redirect to them without meeting the
// rewrite coming back the other way.
export const BRANDING_DEFAULTS = {
  favIco: '/favicon.ico',
  favIcoFallback: '/cactus-favicon.ico',
  favIcoDark: '/favicon-dark.ico',
  faviconSvg: '/favicon.svg',
  faviconSvgFallback: '/cactus-favicon.svg',
  faviconPng: '/favicon-96x96.png',
  faviconPngFallback: '/cactus-favicon-96x96.png',
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

// One icon media row, with what the icon route needs to read its bytes straight
// from storage rather than over the public internet.
export type IconMedia = {
  id: string
  url: string
  mimeType: string
  key: string
  provider: MediaProviderType
}

export type ResolvedBranding = {
  // Where this answer came from. 'live' is a fresh read. 'remembered' is the
  // last good read, handed back because this one failed. 'unavailable' means the
  // read failed and there was nothing to remember: the icon fields are empty
  // because nobody KNOWS what they are, not because the site has none - and every
  // caller must tell those two apart. Treating them as one was the bug behind the
  // Cactus icon on a branded site: one database blip, and the "no icon set"
  // answer was cached by the CDN, by Next, and by every browser that saw it.
  state: 'live' | 'remembered' | 'unavailable'
  // Every icon slot, with storage details. Null = not set (when state is not
  // 'unavailable').
  icons: Record<IconSlot, IconMedia | null>
  // A short fingerprint of which icon files are in use, for ?v= on the icon
  // addresses so a changed icon is a new address. Null when unknown.
  iconVersion: string | null
  // Media-host urls of the icons as uploaded, for admin screens that show the
  // picture itself (the sidebar, the login page). Public pages never link these:
  // they link the addresses above, which the icon route redraws.
  faviconUrl: string | null
  faviconDarkUrl: string | null
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

const NO_ICONS: Record<IconSlot, IconMedia | null> = {
  favicon: null,
  faviconDark: null,
  appIcon: null,
  icon16: null,
  icon32: null,
  appleTouch: null,
  icon192: null,
  icon512: null,
}

const FALLBACK: ResolvedBranding = {
  state: 'unavailable',
  icons: NO_ICONS,
  iconVersion: null,
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

// The last good answer, per server instance. Handed back when a read fails, so a
// database that drops a connection (a deploy's idle sweep, a cold start, the
// public-internet hop to the database server) costs nothing visible: a stale
// icon for a few seconds is the right answer, and Cactus's never is.
let lastGood: ResolvedBranding | null = null

// The database is not configured at all: a fresh deploy before the setup wizard
// has run. That is a site with no branding, not a failed read.
function databaseConfigured(): boolean {
  return !!process.env.DATABASE_URL
}

const UNBRANDED: ResolvedBranding = { ...FALLBACK, state: 'live' }

// Resolves the site's icon + app-identity branding, applying Cactus defaults for
// anything the admin hasn't set. Wrapped in React cache() so the root layout's
// generateMetadata/generateViewport and the page render share a single query per
// request. Never throws: this runs inside metadata resolution for every route,
// error pages included. A failed read answers with the last good read
// (state 'remembered'), or with state 'unavailable' when there is none - never
// with a confident "no icons", which is a different thing entirely.
export const resolveBranding = cache(async (): Promise<ResolvedBranding> => {
  if (!databaseConfigured()) return UNBRANDED

  // Read through the shared cache()d full-row helper rather than a narrow select
  // of its own. SiteConfig is one row of about 5kB, and a public page render
  // used to fetch it four separate times - here, in the public layout, in the
  // menu resolver and in the Puck render metadata - each with a different
  // `select`, which is precisely what stops React's cache() from collapsing
  // them. One shape means one query.
  let config: Awaited<ReturnType<typeof getSiteConfig>>
  try {
    config = await getSiteConfig()
  } catch {
    return lastGood ? { ...lastGood, state: 'remembered' } : FALLBACK
  }

  // No config row yet: setup has not finished. Genuinely unbranded.
  if (!config) return UNBRANDED

  const slotIds: Record<IconSlot, string | null> = {
    favicon: config.faviconMediaId,
    faviconDark: config.faviconDarkMediaId,
    appIcon: config.appIconMediaId,
    icon16: config.favicon16MediaId,
    icon32: config.favicon32MediaId,
    appleTouch: config.appleTouchIconMediaId,
    icon192: config.webManifest192MediaId,
    icon512: config.webManifest512MediaId,
  }
  const ids = [...new Set(Object.values(slotIds).filter((v): v is string => !!v))]

  // One round-trip resolves every referenced media row. A failure here is a
  // failed read like any other - it used to be swallowed into "no rows", which
  // is exactly the confident "no icons" this function must never invent.
  const byId = new Map<string, IconMedia>()
  if (ids.length > 0) {
    try {
      const rows = await prisma.media.findMany({
        where: { id: { in: ids } },
        select: { id: true, url: true, mimeType: true, key: true, provider: true },
      })
      for (const r of rows) byId.set(r.id, r)
    } catch {
      return lastGood ? { ...lastGood, state: 'remembered' } : FALLBACK
    }
  }

  const icons = { ...NO_ICONS }
  for (const slot of Object.keys(slotIds) as IconSlot[]) {
    const id = slotIds[slot]
    icons[slot] = id ? byId.get(id) ?? null : null
  }

  const present = (Object.keys(icons) as IconSlot[]).filter((slot) => icons[slot])
  const iconVersion = present.length
    ? createHash('sha1')
        .update(present.map((slot) => `${slot}:${icons[slot]!.id}:${icons[slot]!.url}`).join('|'))
        .update(`|bg:${config.backgroundColor ?? ''}`)
        .digest('hex')
        .slice(0, 10)
    : null

  const siteName = config.siteName?.trim() || null

  const resolved: ResolvedBranding = {
    state: 'live',
    icons,
    iconVersion,
    faviconUrl: icons.favicon?.url ?? null,
    faviconDarkUrl: icons.faviconDark?.url ?? null,
    faviconMimeType: icons.favicon?.mimeType ?? null,
    faviconDarkMimeType: icons.faviconDark?.mimeType ?? null,
    icon16Url: icons.icon16?.url ?? null,
    icon32Url: icons.icon32?.url ?? null,
    appleTouchUrl: icons.appleTouch?.url ?? null,
    icon192Url: icons.icon192?.url ?? null,
    icon512Url: icons.icon512?.url ?? null,
    name: config.appName?.trim() || siteName || BRANDING_DEFAULTS.name,
    shortName: config.appShortName?.trim() || siteName || BRANDING_DEFAULTS.shortName,
    themeColor: config.themeColor?.trim() || BRANDING_DEFAULTS.themeColor,
    backgroundColor: config.backgroundColor?.trim() || BRANDING_DEFAULTS.backgroundColor,
  }
  lastGood = resolved
  return resolved
})
