// Shared shape and bounds for the backdrop logo - the optional watermark of the
// site logo painted on the page colour behind every public page (Appearance >
// Branding). Kept apart from lib/config/branding.ts, which pulls in Prisma: the
// admin's Branding tab is a client component and must not drag the DB client
// into the browser bundle.

export type BackdropLogoMode = 'light' | 'dark' | 'auto'

export const BACKDROP_LOGO_MODES: BackdropLogoMode[] = ['light', 'dark', 'auto']

/** What the watermark sits on: the page colour, or the Theme colour. */
export type BackdropLogoSurface = 'page' | 'theme'

export const BACKDROP_LOGO_SURFACES: BackdropLogoSurface[] = ['page', 'theme']

/** Width as a percentage of the viewport's shorter side. */
export const BACKDROP_LOGO_SCALE_MIN = 5
export const BACKDROP_LOGO_SCALE_MAX = 100
export const BACKDROP_LOGO_SCALE_DEFAULT = 40

export function clampBackdropScale(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return BACKDROP_LOGO_SCALE_DEFAULT
  return Math.min(BACKDROP_LOGO_SCALE_MAX, Math.max(BACKDROP_LOGO_SCALE_MIN, Math.round(value)))
}

export function normaliseBackdropMode(value: string | null | undefined): BackdropLogoMode {
  return BACKDROP_LOGO_MODES.includes(value as BackdropLogoMode) ? (value as BackdropLogoMode) : 'auto'
}

export function normaliseBackdropSurface(value: string | null | undefined): BackdropLogoSurface {
  return BACKDROP_LOGO_SURFACES.includes(value as BackdropLogoSurface) ? (value as BackdropLogoSurface) : 'page'
}

// The URL goes into a CSS url() inside an inline style attribute, so anything
// that could close the quote, the function or the attribute has to go. Media
// URLs are our own, but a hand-edited row shouldn't be able to inject CSS.
export function backdropLogoCssUrl(url: string): string {
  return `url("${url.replace(/["'()\\<>\s]/g, encodeURIComponent)}")`
}
