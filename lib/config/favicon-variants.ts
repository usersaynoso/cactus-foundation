// Every icon address the site answers, what each one must contain, and where it
// gets its picture from. Pure data and pure functions: no database, no sharp, no
// Next, so the decisions that have repeatedly gone wrong here are covered by a
// plain unit test (favicon-variants.test.ts).
//
// The rules this file exists to hold:
//
// 1. Every address answers with the format its name promises. /favicon.ico is a
//    real ICO, every .png is a PNG of exactly the size in its name, /favicon.svg
//    is an SVG. What the admin happened to upload (WebP, JPEG, a 2000px PNG, an
//    SVG) is only ever a SOURCE; the icon route redraws it into the right shape.
//    WebKit's icon loader refuses a mismatch, and a mismatch is what the media
//    optimiser used to manufacture by turning the generated PNGs into WebP.
// 2. Every address can be drawn from ANY icon the admin has set. A missing 16px
//    rendition is drawn from the favicon, a missing favicon from the app icon, and
//    so on down the chain, so one uploaded image is enough for the whole set and
//    no address ever has to fall back to Cactus on a branded site.
// 3. The variant is decided by the PATH it was asked for, never by a query string
//    a rewrite was supposed to add. Under `next start` the rewrite's ?icon= never
//    reached the route, and every sized PNG quietly answered with the 96px
//    favicon.

export type IconSlot =
  | 'favicon'
  | 'faviconDark'
  | 'appIcon'
  | 'icon16'
  | 'icon32'
  | 'appleTouch'
  | 'icon192'
  | 'icon512'

export type IconVariantName =
  | 'favicon'
  | 'favicon-dark'
  | 'svg'
  | 'svg-dark'
  | 'icon-16'
  | 'icon-16-dark'
  | 'icon-32'
  | 'icon-32-dark'
  | 'icon-96'
  | 'apple-touch'
  | 'icon-192'
  | 'icon-512'

export type IconVariant = {
  name: IconVariantName
  format: 'ico' | 'svg' | 'png'
  // Exact square size of a png variant.
  size?: number
  // Apple flattens transparency to black, so the touch icon is drawn onto the
  // site's background colour instead.
  opaque?: boolean
  // Where to look for a picture, best first. The first slot that is set wins.
  chain: IconSlot[]
  // The bundled Cactus file for an install with no icons at all. A static file at
  // a cactus- name, so redirecting there never meets the rewrite coming back.
  fallback: string
}

// The tab icon: the favicon first, then anything else the admin gave us, biggest
// first so a downscale is always from the best source available.
const TAB_CHAIN: IconSlot[] = ['favicon', 'appIcon', 'icon512', 'icon192', 'appleTouch', 'icon32', 'icon16']
// The home-screen / installed-app icon: the app icon first.
const APP_CHAIN: IconSlot[] = ['appIcon', 'favicon', 'icon512', 'icon192', 'appleTouch', 'icon32', 'icon16']

function chain(...slots: IconSlot[]): IconSlot[] {
  return [...new Set(slots)]
}

export const ICON_VARIANTS: Record<IconVariantName, IconVariant> = {
  favicon: { name: 'favicon', format: 'ico', chain: TAB_CHAIN, fallback: '/cactus-favicon.ico' },
  'favicon-dark': { name: 'favicon-dark', format: 'ico', chain: chain('faviconDark', ...TAB_CHAIN), fallback: '/cactus-favicon.ico' },
  // Only ever the admin's own SVG - see svgSlot().
  svg: { name: 'svg', format: 'svg', chain: ['favicon', 'appIcon'], fallback: '/cactus-favicon.svg' },
  'svg-dark': { name: 'svg-dark', format: 'svg', chain: ['faviconDark'], fallback: '/cactus-favicon.svg' },
  'icon-16': { name: 'icon-16', format: 'png', size: 16, chain: chain('icon16', ...TAB_CHAIN), fallback: '/cactus-favicon-16x16.png' },
  'icon-16-dark': { name: 'icon-16-dark', format: 'png', size: 16, chain: chain('faviconDark', 'icon16', ...TAB_CHAIN), fallback: '/cactus-favicon-16x16.png' },
  'icon-32': { name: 'icon-32', format: 'png', size: 32, chain: chain('icon32', ...TAB_CHAIN), fallback: '/cactus-favicon-32x32.png' },
  'icon-32-dark': { name: 'icon-32-dark', format: 'png', size: 32, chain: chain('faviconDark', 'icon32', ...TAB_CHAIN), fallback: '/cactus-favicon-32x32.png' },
  'icon-96': { name: 'icon-96', format: 'png', size: 96, chain: TAB_CHAIN, fallback: '/cactus-favicon-96x96.png' },
  'apple-touch': { name: 'apple-touch', format: 'png', size: 180, opaque: true, chain: chain('appleTouch', ...APP_CHAIN), fallback: '/cactus-apple-touch-icon.png' },
  'icon-192': { name: 'icon-192', format: 'png', size: 192, chain: chain('icon192', ...APP_CHAIN), fallback: '/cactus-web-app-manifest-192x192.png' },
  'icon-512': { name: 'icon-512', format: 'png', size: 512, chain: chain('icon512', ...APP_CHAIN), fallback: '/cactus-web-app-manifest-512x512.png' },
}

// The ICO is three PNGs in one container: 16 and 32 for tabs, 48 for Windows
// shortcuts and the odd bookmark bar. Each size draws from its own chain, so a
// hand-picked 16px rendition is the one that lands in the 16px slot.
export const ICO_ENTRIES: { size: number; light: IconVariantName; dark: IconVariantName }[] = [
  { size: 16, light: 'icon-16', dark: 'icon-16-dark' },
  { size: 32, light: 'icon-32', dark: 'icon-32-dark' },
  { size: 48, light: 'icon-96', dark: 'favicon-dark' },
]

// The public addresses, each rewritten by next.config.ts to
// /api/branding/favicon/<variant>. Path-based on purpose - see rule 3 above.
export const ICON_PATHS: Record<string, IconVariantName> = {
  '/favicon.ico': 'favicon',
  '/favicon-dark.ico': 'favicon-dark',
  '/favicon.svg': 'svg',
  '/favicon-dark.svg': 'svg-dark',
  '/favicon-16x16.png': 'icon-16',
  '/favicon-dark-16x16.png': 'icon-16-dark',
  '/favicon-32x32.png': 'icon-32',
  '/favicon-dark-32x32.png': 'icon-32-dark',
  '/favicon-96x96.png': 'icon-96',
  '/apple-touch-icon.png': 'apple-touch',
  '/apple-touch-icon-precomposed.png': 'apple-touch',
  '/web-app-manifest-192x192.png': 'icon-192',
  '/web-app-manifest-512x512.png': 'icon-512',
}

export const ICON_ROUTE_BASE = '/api/branding/favicon'

function isVariantName(value: string | null | undefined): value is IconVariantName {
  return !!value && Object.prototype.hasOwnProperty.call(ICON_VARIANTS, value)
}

/**
 * Which icon a request is for. In order: the path segment the rewrite carries
 * (/api/branding/favicon/icon-16), the public address itself in case the route
 * ever sees the pre-rewrite path, and the two query forms older pages still
 * carry (?icon=icon-16, ?scheme=dark). Anything else is the plain favicon.
 */
export function variantForRequest(pathname: string, search: URLSearchParams, segments?: string[]): IconVariant {
  const segment = segments?.[0]
  const named = search.get('icon')
  const base: IconVariantName = isVariantName(segment)
    ? segment
    : ICON_PATHS[pathname] ?? (isVariantName(named) ? named : 'favicon')
  // /favicon.ico?scheme=dark is what pages rendered before the dedicated dark
  // addresses still link, and the rewrite turns it into the plain favicon path.
  if (base === 'favicon' && search.get('scheme') === 'dark') return ICON_VARIANTS['favicon-dark']
  return ICON_VARIANTS[base]
}

export function isSvgMime(mimeType: string | null | undefined): boolean {
  return !!mimeType && mimeType.toLowerCase().startsWith('image/svg')
}

/**
 * The first slot in the chain that has an icon. For the svg variants the winner
 * must itself be an SVG: a raster favicon the admin hand-picked outranks an SVG
 * app icon, and drawing a raster into an SVG wrapper would only lie about it.
 */
export function pickSlot<T extends { mimeType: string }>(
  variant: IconVariant,
  icons: Partial<Record<IconSlot, T | null>>,
): IconSlot | null {
  for (const slot of variant.chain) {
    const icon = icons[slot]
    if (!icon) continue
    if (variant.format === 'svg') return isSvgMime(icon.mimeType) ? slot : null
    return slot
  }
  return null
}

export type IconLink = { url: string; type?: string; sizes?: string; media?: string }

export type IconLinkSet = {
  icon: IconLink[]
  shortcut: string
  apple: string
  // For the web-app manifest.
  manifest: { src: string; sizes: string; type: string; purpose: 'any' }[]
}

const LIGHT = '(prefers-color-scheme: light)'
const DARK = '(prefers-color-scheme: dark)'

/**
 * The <link> tags the root layout emits, decided from what the branding read
 * said.
 *
 * - `known: false` means the read failed and nothing was remembered. The answer
 *   is then the site's own addresses with no guesses about SVG or dark mode,
 *   because the route behind them decides at fetch time. This is the case that
 *   used to write the Cactus icon into a page Next and the CDN then held on to.
 * - A site with no icons at all gets the bundled Cactus files directly.
 * - Every branded address carries ?v=<version> so a changed icon is a new
 *   address: the browser's icon cache, which outlives any HTTP cache header, has
 *   nothing stale to serve for it.
 */
export function iconLinksFor(input: {
  known: boolean
  icons: Partial<Record<IconSlot, { mimeType: string } | null>>
  version: string | null
}): IconLinkSet {
  const branded = !input.known || Object.values(input.icons).some(Boolean)
  if (!branded) {
    return {
      icon: [
        { url: '/cactus-favicon.svg', type: 'image/svg+xml' },
        { url: '/cactus-favicon-96x96.png', sizes: '96x96', type: 'image/png' },
        { url: '/cactus-favicon.ico', sizes: '16x16 32x32 48x48', type: 'image/x-icon' },
      ],
      shortcut: '/cactus-favicon.ico',
      apple: '/cactus-apple-touch-icon.png',
      manifest: [
        { src: '/cactus-web-app-manifest-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/cactus-web-app-manifest-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      ],
    }
  }

  const v = (path: string) => (input.version ? `${path}?v=${input.version}` : path)
  const hasDark = input.known && !!input.icons.faviconDark
  const hasSvg = input.known && pickSlot(ICON_VARIANTS.svg, input.icons) !== null
  const hasDarkSvg = hasDark && pickSlot(ICON_VARIANTS['svg-dark'], input.icons) !== null
  const light = hasDark ? { media: LIGHT } : {}

  const icon: IconLink[] = []
  // SVG first: browsers that take it prefer it at every size.
  if (hasSvg) icon.push({ url: v('/favicon.svg'), type: 'image/svg+xml', ...light })
  if (hasDarkSvg) icon.push({ url: v('/favicon-dark.svg'), type: 'image/svg+xml', media: DARK })
  icon.push({ url: v('/favicon.ico'), sizes: '16x16 32x32 48x48', type: 'image/x-icon', ...light })
  if (hasDark) icon.push({ url: v('/favicon-dark.ico'), sizes: '16x16 32x32 48x48', type: 'image/x-icon', media: DARK })
  icon.push({ url: v('/favicon-16x16.png'), sizes: '16x16', type: 'image/png', ...light })
  icon.push({ url: v('/favicon-32x32.png'), sizes: '32x32', type: 'image/png', ...light })
  if (hasDark) {
    icon.push({ url: v('/favicon-dark-16x16.png'), sizes: '16x16', type: 'image/png', media: DARK })
    icon.push({ url: v('/favicon-dark-32x32.png'), sizes: '32x32', type: 'image/png', media: DARK })
  }
  icon.push({ url: v('/favicon-96x96.png'), sizes: '96x96', type: 'image/png', ...light })
  icon.push({ url: v('/web-app-manifest-192x192.png'), sizes: '192x192', type: 'image/png' })

  return {
    icon,
    // Unversioned on purpose: these are the addresses browsers and crawlers
    // probe by name, and the bare name is what they will ask for.
    shortcut: '/favicon.ico',
    apple: v('/apple-touch-icon.png'),
    manifest: [
      { src: v('/web-app-manifest-192x192.png'), sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: v('/web-app-manifest-512x512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  }
}
