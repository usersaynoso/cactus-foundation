import type { MetadataRoute } from 'next'
import { resolveBranding, BRANDING_DEFAULTS } from '@/lib/config/branding'

// Reads the site config, so it must resolve per request rather than being baked
// at build time.
export const dynamic = 'force-dynamic'

// Dynamic web-app manifest. Replaces the old static /site.webmanifest so the
// installable-app name, icons and colours follow the admin's Branding settings,
// falling back to the Cactus defaults when unset. Next serves this at
// /manifest.webmanifest and links it automatically on every page.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const b = await resolveBranding()
  return {
    name: b.name,
    short_name: b.shortName,
    icons: [
      // purpose 'any' (not 'maskable') because an admin-supplied icon has no
      // guaranteed safe-zone padding; 'maskable' would let launchers crop it.
      { src: b.icon192Url ?? BRANDING_DEFAULTS.icon192, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: b.icon512Url ?? BRANDING_DEFAULTS.icon512, sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
    theme_color: b.themeColor,
    background_color: b.backgroundColor,
    display: 'standalone',
  }
}
