// Shared by the SiteLogo block's two render halves - SiteLogoClient (the editor)
// and SiteLogoRsc (the published page). Those are deliberately separate
// implementations of the same markup ("Mirrors SiteLogoClient exactly", says the
// comment on the RSC one), which makes them a standing drift hazard, so anything
// that would otherwise be written twice lives here instead. Plain module, no
// 'use client': the RSC half imports it from the server.
import { normalizeResponsiveValue, pickResponsive, responsiveMediaCssFor, type Device, type ResponsiveValue } from '@/lib/puck/responsiveValue'

export const LOGO_ALIGN_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
]

const JUSTIFY_MAP: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end' }

// The logo's <a> is already a block-level flex container, so it spans whatever
// width it is given and justify-content moves the logo within it. No wrapper
// element is needed, which is the point: the markup is unchanged for anyone who
// never touches the field. Unset resolves to flex-start - what the <a> already
// did - so every logo saved before this field existed renders identically.
//
// Inside a header column the <a> is a flex *item*, sized to its content, so
// there is no free space to distribute and this is a no-op there: alignment in
// the header stays the column's job, exactly as before.
export function siteLogoAlign(
  id: string | undefined,
  align: ResponsiveValue<string> | string | undefined,
): { justifyContent: string; css: string } {
  const rv = normalizeResponsiveValue<string>(align)
  const at = (d: Device) => JUSTIFY_MAP[pickResponsive(rv, d) ?? 'left'] ?? 'flex-start'
  return {
    justifyContent: at('desktop'),
    css: id ? responsiveMediaCssFor(`a[data-sitelogo-id="${id}"]`, (d) => `justify-content:${at(d)};`) : '',
  }
}

// Element height per breakpoint. The logo image is sized by the shared
// --header-cell-height custom property, so the tablet/mobile overrides just
// swap the variable via media rules - the shrink-on-scroll override (a more
// specific selector, also !important) still wins at every breakpoint. Legacy
// plain-number data normalises to desktop-only; `legacy` carries the
// pre-rename logoHeight key so the old `cellHeight ?? logoHeight ?? 40`
// fallback chain holds even when every breakpoint is cleared.
export function siteLogoCellHeight(
  id: string | undefined,
  cellHeight: ResponsiveValue<number> | number | undefined,
  legacy?: number,
): { base: number; css: string } {
  const rv = normalizeResponsiveValue<number>(cellHeight)
  const at = (d: Device) => pickResponsive(rv, d) ?? legacy ?? 40
  return {
    base: at('desktop'),
    css: id ? responsiveMediaCssFor(`a[data-sitelogo-id="${id}"] img[data-site-logo]`, (d) => `--header-cell-height:${at(d)}px;`) : '',
  }
}

// Which pair of images the logo actually draws. `logoUrl`/`logoUrlDark` are the
// site-wide logo, injected into every SiteLogo block by resolveTemplateData;
// `imageUrl`/`imageUrlDark` are this block's own override, so one header can
// show the full lockup on desktop and a compact mark on mobile (two blocks, one
// hidden at each breakpoint) without the site having to choose between them.
//
// The override replaces the PAIR, never half of it: an override with no dark arm
// falls back to its own light image rather than to the site's dark logo, which
// would otherwise pair a mark in light mode with a lockup in dark. Returning
// null for dark is what makes the render draw a single image with no
// data-logo-variant, shown in both schemes.
export function siteLogoImages(
  imageUrl: string | null | undefined,
  imageUrlDark: string | null | undefined,
  logoUrl: string | null | undefined,
  logoUrlDark: string | null | undefined,
): { light: string | null; dark: string | null } {
  const light = (imageUrl ?? '').trim()
  if (light) return { light, dark: (imageUrlDark ?? '').trim() || null }
  return { light: logoUrl || null, dark: logoUrlDark || null }
}
