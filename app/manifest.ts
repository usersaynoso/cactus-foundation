import type { MetadataRoute } from 'next'
import { resolveBranding } from '@/lib/config/branding'
import { iconLinksFor } from '@/lib/config/favicon-variants'

// Reads the site config, so it must resolve per request rather than being baked
// at build time.
export const dynamic = 'force-dynamic'

// Dynamic web-app manifest. Replaces the old static /site.webmanifest so the
// installable-app name, icons and colours follow the admin's Branding settings,
// falling back to the Cactus defaults when unset. Next serves this at
// /manifest.webmanifest and links it automatically on every page.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const b = await resolveBranding()
  // Nothing known about the site (a failed read, nothing remembered): an error
  // nobody caches beats a manifest that names the app "Cactus Foundation" and
  // is held at the edge for an hour. Browsers treat a missing manifest as no
  // install offer for now, and ask again next time.
  if (b.state === 'unavailable') {
    throw new Error('Branding unavailable; not publishing a manifest with Cactus defaults')
  }
  const links = iconLinksFor({ known: true, icons: b.icons, version: b.iconVersion })
  return {
    name: b.name,
    short_name: b.shortName,
    // purpose 'any' (not 'maskable') because an admin-supplied icon has no
    // guaranteed safe-zone padding; 'maskable' would let launchers crop it.
    // This origin's addresses, drawn to the exact size by the icon route - see
    // lib/config/favicon-variants.ts.
    icons: links.manifest,
    theme_color: b.themeColor,
    background_color: b.backgroundColor,
    display: 'standalone',
  }
}
