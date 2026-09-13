// Shared by the SiteLogo block's two render halves - SiteLogoClient (the editor)
// and SiteLogoRsc (the published page). Those are deliberately separate
// implementations of the same markup ("Mirrors SiteLogoClient exactly", says the
// comment on the RSC one), which makes them a standing drift hazard, so anything
// that would otherwise be written twice lives here instead. Plain module, no
// 'use client': the RSC half imports it from the server.
import { preload } from 'react-dom'
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

/**
 * The media condition under which each half of a light/dark pair is the one on
 * screen before any script has run - which is when the browser decides what to
 * fetch. They mirror the logo swap in app/globals.css exactly: the dark image is
 * shown under a dark colour-scheme preference, the light one otherwise.
 * `not all and (...)` rather than `(prefers-color-scheme: light)` so the two can
 * never both be false.
 */
export const SITE_LOGO_DARK_MEDIA = '(prefers-color-scheme: dark)'
export const SITE_LOGO_LIGHT_MEDIA = 'not all and (prefers-color-scheme: dark)'

/** One image preload the logo asks for, and the condition that has to hold for it. */
export type SiteLogoPreload = { href: string; media: string }

/**
 * How a logo's images are fetched: whether the <img>s are lazy, and what to preload.
 *
 * WHY. Both images of a pair are always in the markup and CSS shows one, which is
 * what keeps the theme swap free of flicker - but an eager <img> is downloaded
 * whether it is displayed or not, and React writes a preload into the document
 * head for every eager <img> it renders. So every page fetched BOTH logos before
 * anything else in the body, once per URL however many header cells (desktop,
 * tablet, mobile) draw them. On deskwell.co.uk that is two 55 KB SVGs, one of
 * which is never seen.
 *
 * `loading="lazy"` is the part that is right in every theme state at once. A lazy
 * image with `display: none` has no box, never comes near the viewport, and is
 * never requested - so whichever variant CSS hides stays unfetched, whether the
 * visitor chose light, chose dark, or left it on auto, and flipping the toggle
 * later fetches the other one then. No script decides anything.
 *
 * Lazy alone would lose the head start the preload gave the visible one, so each
 * half is preloaded under the media condition that shows it. A preload whose media
 * does not match is not fetched at all. That matches what is on screen for every
 * visitor on "auto", and for anyone whose saved choice agrees with their device,
 * which between them is nearly everybody. The saved theme is applied by an inline
 * script in the document head before the body is parsed (app/layout.tsx), so a
 * visitor whose saved choice DISAGREES with their device sees their own choice
 * from the first frame; for them the preload fetches the device's variant, which
 * goes unused, and their own variant is fetched as a lazy image as soon as layout
 * shows it. That one case costs a wasted logo download, never a wrong logo.
 *
 * A single image (no dark variant) is unchanged: eager, and preloaded by React as
 * before, since it is shown in both schemes.
 */
export function siteLogoFetchPlan(
  light: string,
  dark: string | null,
): { loading: 'lazy' | undefined; preloads: SiteLogoPreload[] } {
  if (!dark) return { loading: undefined, preloads: [] }
  return {
    loading: 'lazy',
    preloads: [
      { href: light, media: SITE_LOGO_LIGHT_MEDIA },
      { href: dark, media: SITE_LOGO_DARK_MEDIA },
    ],
  }
}

/**
 * Issue the plan's preloads and hand back the `loading` value for both <img>s.
 * Called during render by both halves of the block, which is where React wants
 * `preload` called; React de-duplicates by URL, so three logos on one page still
 * ask once per image.
 */
export function requestSiteLogoImages(light: string, dark: string | null): 'lazy' | undefined {
  const plan = siteLogoFetchPlan(light, dark)
  for (const { href, media } of plan.preloads) preload(href, { as: 'image', media })
  return plan.loading
}

// Fine vertical positioning. Alignment above handles the horizontal, and the
// header column centres the logo vertically, but "centred" is not always where
// a lockup looks right - the optical centre of a logo with descenders, or with
// whitespace baked into the image, sits a few pixels off the geometric one.
//
// A transform, deliberately, not margin/top: it moves the painted logo without
// changing the <a>'s box, so nudging it can never re-flow the header, change
// its height, or shove the row's other cells about. Unset (or 0) emits no
// transform and no CSS at all, so every logo saved before this field existed
// renders byte-identically. Positive nudges down, negative up.
export function siteLogoNudge(
  id: string | undefined,
  nudgeY: ResponsiveValue<number> | number | undefined,
): { transform: string | undefined; css: string } {
  const rv = normalizeResponsiveValue<number>(nudgeY)
  const at = (d: Device) => {
    const v = pickResponsive(rv, d)
    return typeof v === 'number' && Number.isFinite(v) ? v : 0
  }
  const decl = (d: Device) => (at(d) === 0 ? 'transform:none;' : `transform:translateY(${at(d)}px);`)
  return {
    transform: at('desktop') === 0 ? undefined : `translateY(${at('desktop')}px)`,
    css: id ? responsiveMediaCssFor(`a[data-sitelogo-id="${id}"]`, decl) : '',
  }
}
