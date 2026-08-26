// Decorative repeating background pattern, shared by the Section and CTA Banner
// blocks. A pattern is a small tiling image or SVG from the media library that
// sits above the block's own background colour/image and below its content.
//
// Two things stop this being a plain `backgroundImage` on the block:
//
//  1. Section already paints a full-bleed photo through `backgroundImage`, and a
//     pattern has to be able to ride on top of one rather than replace it.
//  2. A pattern needs a separate image per colour scheme - a dark fleck on paper
//     is invisible on a dark background. Colours solve that with the
//     `light-dark()` encoding in lib/puck/lightDark.ts, but `light-dark()` only
//     takes colours, never a `url()`. So the two arms have to be real CSS rules
//     keyed on the theme, the same way globals.css swaps the site logo.
//
// Both are met by painting the pattern on the block's own `::before`, at
// `z-index:-1`: that paints above the element's background and below its in-flow
// content, needs no extra wrapper element, and leaves the block's markup in the
// editor and on the published page byte-identical (the two share one render
// function, so there is no parity copy to keep in step). The host has to be a
// stacking context for the negative z-index to stay inside it - see
// `patternHostStyle`.

import type React from 'react'
import {
  normalizeResponsiveValue,
  pickResponsive,
  responsiveMediaCssFor,
  tabletMediaQuery,
  mobileMediaQuery,
  type Device,
  type ResponsiveValue,
} from '@/lib/puck/responsiveValue'

export type PatternProps = {
  patternImage?: string
  patternImageDark?: string
  patternSize?: ResponsiveValue<string> | string
  /** Dark-mode override for the tile size. Left blank entirely = use the light
   * size, so a block that only wants a different image is unaffected. Set at one
   * breakpoint, it cascades to the narrower ones like every other responsive
   * field here - set a dark mobile size too if it should differ there. */
  patternSizeDark?: ResponsiveValue<string> | string
  /** The tile's intrinsic pixel size as `"660x472"`, measured in the editor when
   * the pattern is picked (see resolvePatternData in lib/puck/config.core.tsx)
   * and never shown as a field. It exists so the size can be snapped - see
   * `snapPatternWidth`. Absent on a block last edited before this existed, in
   * which case nothing is snapped and the size renders exactly as typed. */
  patternRatio?: string
  /** The tile's own base colour as `#rrggbb`, sampled in the editor - and only
   * when the tile proved FULLY opaque, because it is painted as the pattern
   * layer's background-color. Snapping keeps tile joins on whole pixels at the
   * scale we control, but browser zoom, a fit-scaled editor canvas or a
   * fractionally-scaled display put every edge back on a fraction, where edge
   * antialiasing lets whatever is behind bleed through - a gold section colour
   * showed through a dark teal tile as an orange grid. With the tile's own
   * colour underneath, whatever bleeds through a join IS the tile colour, at
   * every scale there is. An opaque tile hides what is behind it anyway, so
   * backing it changes nothing else; a tile with any transparency never gets
   * one (empty string), because it genuinely shows the host through its body. */
  patternEdge?: string
  /** Same, sampled from the dark-mode tile. Empty when there is no dark image
   * (the light colour already applies) or the dark tile is not fully opaque. */
  patternEdgeDark?: string
}

// Everything below is interpolated straight into a <style> tag, so both the URL
// and the size are allow-listed rather than escaped. A media URL is either a
// same-origin path or an http(s) address and never contains a quote, a bracket,
// a backslash or whitespace; anything that does is a value we didn't produce, so
// the pattern is dropped rather than rendered. Failing closed here is the point:
// a rejected pattern is a missing decoration, an accepted one could close the
// declaration and inject arbitrary CSS into the page.
export function patternUrl(raw: string | undefined, { requireAbsolute = false }: { requireAbsolute?: boolean } = {}): string | null {
  const url = (raw ?? '').trim()
  if (!url) return null
  const absolute = /^https?:\/\//i.test(url)
  if (!absolute && (requireAbsolute || !url.startsWith('/'))) return null
  if (/["'()\\\s;{}<>]/.test(url)) return null
  return url
}

function cssUrl(raw: string | undefined): string | null {
  const url = patternUrl(raw)
  return url === null ? null : `url("${url}")`
}

const SIZE_RE = /^(auto|cover|contain|\d+(?:\.\d+)?(?:px|rem|em|%|vw|vh))$/

/** `"660x472"` -> `{ w: 660, h: 472 }`. Anything else is treated as unmeasured. */
export function parsePatternRatio(raw: string | undefined): { w: number; h: number } | null {
  const m = /^(\d+)x(\d+)$/.exec((raw ?? '').trim())
  if (!m) return null
  const w = Number(m[1]), h = Number(m[2])
  return w > 0 && h > 0 ? { w, h } : null
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)

/**
 * The smallest step in tile WIDTH that keeps the tile's HEIGHT a whole number,
 * and the height step that goes with it.
 *
 * This is the whole fix, so it is worth stating why. `background-size` sets the
 * width; the browser derives the height from the image's own proportions. Draw a
 * 660x472 tile 96px wide and it is 68.6545px tall, so every join after the first
 * lands part-way through a device pixel, the tile's last row is rendered light,
 * and you get a pale line across the pattern once per tile. A square tile cannot
 * do this - whole width in, whole height out - which is exactly why the one
 * square pattern on the site never showed it.
 *
 * Reduce the ratio to a/b. A height of `m*b` gives a width of `m*a`, so whole
 * multiples always work. Halves work too whenever b is still even, and so on
 * down: dividing both by 2^k leaves the height a whole number for as long as
 * 2^k divides b, and the width a finite decimal (dividing by two always is).
 * Taking k as far as it goes gives the finest honest grid of sizes - for
 * 660x472 that is every 82.5px (height 59px), for 225x400 every 0.5625px
 * (height 1px), for a square tile every 1px.
 *
 * NOT done by stretching the tile to a whole height with a two-value
 * `background-size`: a stretched tile rasterises through a different path and
 * draws its own seam, which is the mistake shipped in 0.5.1326 and reverted.
 */
export function patternSizeStep(w: number, h: number): { width: number; height: number } {
  const g = gcd(w, h)
  let a = w / g, b = h / g
  while (b % 2 === 0) { a /= 2; b /= 2 }
  return { width: a, height: b }
}

/** Trim float noise without lying about the value - 82.5, not 82.50000000001. */
const fmt = (n: number) => String(Number(n.toFixed(6)))

/**
 * Snap a tile width to the nearest one whose height is a whole number. Returns
 * the width unchanged when the tile has never been measured, so a block from
 * before this existed renders exactly as it did.
 */
export function snapPatternWidth(px: number, ratio: { w: number; h: number } | null): number {
  if (!ratio || !(px > 0)) return px
  const step = patternSizeStep(ratio.w, ratio.h)
  const k = Math.max(1, Math.round(px / step.width))
  return k * step.width
}

/** The tile height a given width produces, for the editor's helper text. */
export function patternTileHeight(px: number, ratio: { w: number; h: number } | null): number | null {
  return ratio ? px * ratio.h / ratio.w : null
}

// All snapping happens HERE, at render, and nowhere else. The editor stores the
// size exactly as the owner typed it - an earlier version rewrote the field
// through resolveData and the box snapped back under the owner's fingers, which
// is how "I can't type in the pattern size box" happened. Rendering a nudged
// value while storing the typed one costs nothing: the editor preview and the
// published page share this function, so they agree with each other.
//
// A px value is snapped in arithmetic. A rem/em value cannot be - what it is in
// pixels depends on font sizes only the browser knows - so the browser is asked
// to do the same sum itself with CSS round(), which resolves the unit first:
//   background-size:6rem;                            <- fallback, typed value
//   background-size:max(82.5px,round(nearest,6rem,82.5px));
// A browser without round() drops the second declaration and keeps the typed
// size - exactly the pre-snapping behaviour, never anything worse. The max()
// stops a tiny size rounding to zero. %/vw/vh pass through untouched: a tile
// sized relative to the viewport cannot land on whole pixels anyway.
//
// Returns one value (typed === rendered) or two (fallback + snapped), for the
// caller to emit as consecutive background-size declarations.
function cssSizeValues(raw: string | undefined, ratio: { w: number; h: number } | null): string[] {
  const v = (raw ?? '').trim()
  if (!SIZE_RE.test(v)) return ['auto']
  const px = /^(\d+(?:\.\d+)?)px$/.exec(v)
  if (px) {
    const n = Number(px[1])
    return [ratio ? `${fmt(snapPatternWidth(n, ratio))}px` : `${Math.max(1, Math.round(n))}px`]
  }
  if (ratio && /^(\d+(?:\.\d+)?)(rem|em)$/.test(v)) {
    const step = fmt(patternSizeStep(ratio.w, ratio.h).width)
    return [v, `max(${step}px,round(nearest,${v},${step}px))`]
  }
  return [v]
}

// The backing colour is emitted into a style tag, so it is allow-listed like
// the url: only the exact #rrggbb shape resolvePatternData produces is
// accepted, anything else is dropped rather than rendered.
function cssEdge(raw: string | undefined): string | null {
  const v = (raw ?? '').trim()
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null
}

// One or two background-size declarations from the values above, in fallback
// order so the snapped one wins wherever round() is understood.
function sizeDecls(vals: string[], important: boolean): string {
  return vals.map((x) => `background-size:${x}${important ? ' !important' : ''};`).join('')
}

const DEVICES = ['desktop', 'tablet', 'mobile'] as const

export function hasPattern(props: PatternProps): boolean {
  return cssUrl(props.patternImage) !== null
}

// The block's own style needs three things for the ::before to behave: a
// positioning context to be `inset:0` against, a stacking context so the
// negative z-index can't slip behind the block's background (an element that is
// merely `position:relative` doesn't make one), and clipping so a tile can't
// spill past a rounded corner. Returned as a patch rather than spread blindly by
// the caller - Section and the CTA Banner both compute `position` and `overflow`
// of their own, and a sticky block's `position` must win.
// `clip: false` for a host that must NOT gain an overflow context - the page
// root wraps every Section on the page, and overflow:hidden on an ancestor
// silently disables `position: sticky` in all of them. It has no rounded corners
// for a tile to escape past either, so there is nothing to clip.
export function patternHostStyle(props: PatternProps, { clip = true }: { clip?: boolean } = {}): React.CSSProperties {
  if (!hasPattern(props)) return {}
  return { isolation: 'isolate', position: 'relative', ...(clip ? { overflow: 'hidden' as const } : {}) }
}

// The <style> body for one block instance, keyed on `[data-pattern-id="<id>"]`.
// Empty string when there is no pattern, so a block that has never been given
// one renders exactly what it rendered before this existed.
export function patternCss(id: string | undefined, props: PatternProps): string {
  const light = cssUrl(props.patternImage)
  if (!id || !light) return ''
  const dark = cssUrl(props.patternImageDark)
  const selector = `[data-pattern-id="${id}"]::before`

  const ratio = parsePatternRatio(props.patternRatio)
  const edge = cssEdge(props.patternEdge)
  // A dark IMAGE is a different file; backing it with the light tile's colour
  // could be exactly the clash this exists to prevent, so a dark tile only gets
  // the colour sampled from itself, or none.
  const darkEdge = cssEdge(props.patternEdgeDark)
  const sizeRv = normalizeResponsiveValue<string>(props.patternSize)
  const sizeValsAt = (d: Device) => cssSizeValues(pickResponsive(sizeRv, d), ratio)

  // Dark mode can want the tile at a different size - a pattern with more air in
  // it usually needs to be bigger to read the same against a dark background.
  // A device with no dark value of its own resolves the normal way (desktop ->
  // tablet -> mobile) and only falls through to the LIGHT size once that cascade
  // comes up empty - never to 'auto', which would quietly undo the light size.
  // The dark image is a different FILE and may well be a different shape, but in
  // practice a pack ships both arms at one size, so it is snapped on the light
  // tile's measurement rather than carrying a second ratio for the sake of it.
  const darkSizeRv = normalizeResponsiveValue<string>(props.patternSizeDark)
  const hasDarkSize = DEVICES.some((d) => (darkSizeRv[d] ?? '').trim() !== '')
  const darkValsAt = (d: Device) => {
    const raw = (pickResponsive(darkSizeRv, d) ?? '').trim()
    return raw ? cssSizeValues(raw, ratio) : sizeValsAt(d)
  }

  // `background-position:0 0`, NOT `center`. Centring a REPEATED background puts
  // the tile grid's origin at (box - tile) / 2, which is a fractional pixel most
  // of the time; the browser then draws every tile boundary on a half-pixel and
  // hairline gaps appear between the tiles, showing whatever is behind the
  // pattern - white, on a page that has not been given a background of its own.
  // A tiling pattern has no centre worth honouring, so it starts at the corner.
  // The layer bleeds a pixel above and below its block on purpose. Two blocks
  // stacked flush still show a hairline of the page between them whenever their
  // heights land on a fractional pixel - each box's background is snapped to
  // device pixels on its own - and a patterned block over a pale page shows that
  // as a white line. A pixel of overlap covers it, and a decorative tile
  // overhanging by a pixel is invisible. Hosts that clip (anything rounded) trim
  // the bleed back off, which is why Section only clips when it has a reason to.
  const rules: string[] = [
    `${selector}{content:"";position:absolute;inset:-1px 0;z-index:-1;pointer-events:none;border-radius:inherit;` +
      `${edge ? `background-color:${edge};` : ''}background-image:${light};background-repeat:repeat;background-position:0 0;${sizeDecls(sizeValsAt('desktop'), false)}}`,
  ]

  // Mirrors the dark-mode logo swap in globals.css: the explicit `data-theme`
  // arm covers a visitor who has chosen a theme, the media query covers the
  // "follow my system" default, where nothing is stamped on <html> at all.
  if (dark || hasDarkSize) {
    const chosen = `[data-theme="dark"] ${selector}`
    const system = `:root:not([data-theme="light"]) ${selector}`
    // The size carries !important because the light breakpoint rules below do
    // (they have to beat an inline style on other blocks, see
    // responsiveMediaCssFor) and an important declaration beats a plain one
    // whatever the specificity. The image needs none: nothing else sets it.
    const decls = (d: Device) =>
      `${dark ? `${darkEdge ? `background-color:${darkEdge};` : ''}background-image:${dark};` : ''}${hasDarkSize ? sizeDecls(darkValsAt(d), true) : ''}`
    rules.push(`${chosen}{${decls('desktop')}}`)
    rules.push(`@media(prefers-color-scheme:dark){${system}{${decls('desktop')}}}`)

    // Breakpoints, for the dark size only - the image does not change with the
    // viewport. A breakpoint whose resolved dark size matches desktop's emits
    // nothing, same rule responsiveMediaCssFor follows.
    if (hasDarkSize) {
      for (const [query, device] of [[tabletMediaQuery(), 'tablet'], [mobileMediaQuery(), 'mobile']] as const) {
        if (sizeDecls(darkValsAt(device), true) === sizeDecls(darkValsAt('desktop'), true)) continue
        const decl = sizeDecls(darkValsAt(device), true)
        rules.push(`${query}{${chosen}{${decl}}}`)
        // Nested @media is not something every browser this has to run in
        // supports, so the two conditions are combined into one query instead.
        rules.push(`@media(prefers-color-scheme:dark) and ${query.replace(/^@media\s*/, '')}{${system}{${decl}}}`)
      }
    }
  }

  const sizeCss = responsiveMediaCssFor(selector, (d) => sizeDecls(sizeValsAt(d), false))
  if (sizeCss) rules.push(sizeCss)

  return rules.join('\n')
}
