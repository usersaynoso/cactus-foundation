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
  /** Tile HEIGHT, and the cure for hairline seams across a non-square tile.
   * `patternSize` alone sets the width and leaves the height to the image's own
   * proportions, which lands on a fractional pixel for all but a lucky few
   * widths - a 660x472 tile drawn 96px wide is 68.65px tall, the rounding error
   * accumulates down the grid, and every few rows a hairline of whatever sits
   * behind the pattern shows through. Setting a whole-pixel height alongside a
   * whole-pixel width makes every row land on a device pixel. The half-percent
   * of stretch that costs is invisible on decoration. Blank = proportional, as
   * before. */
  patternHeight?: ResponsiveValue<string> | string
  /** Dark-mode override for the tile height, same "blank = use the light one"
   * rule as `patternSizeDark`. */
  patternHeightDark?: ResponsiveValue<string> | string
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

// A fractional pixel size is a seam waiting to happen: the browser tiles at the
// fractional size, the rounding error accumulates across the grid, and every few
// rows or columns a hairline of whatever sits behind the pattern shows through.
// Whole pixels are the only size we can guarantee tile cleanly, so a px value is
// rounded to one. Other units are relative to things we cannot resolve here and
// are passed through as typed.
//
// This only ever fixes the axis it is given. An unset height is `auto`, which the
// browser derives from the image's own proportions and is fractional for all but
// a lucky few widths - see `patternHeight`.
function cssSize(raw: string | undefined): string {
  const v = (raw ?? '').trim()
  if (!SIZE_RE.test(v)) return 'auto'
  const px = /^(\d+(?:\.\d+)?)px$/.exec(v)
  if (px) return `${Math.max(1, Math.round(Number(px[1])))}px`
  return v
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

  const sizeRv = normalizeResponsiveValue<string>(props.patternSize)
  const sizeAt = (d: Device) => cssSize(pickResponsive(sizeRv, d))

  // The height is optional and omitted entirely when blank, so a block that has
  // never been given one emits `background-size:<width>` exactly as before.
  const heightRv = normalizeResponsiveValue<string>(props.patternHeight)
  const heightAt = (d: Device) => {
    const raw = (pickResponsive(heightRv, d) ?? '').trim()
    return raw ? cssSize(raw) : ''
  }
  const pairAt = (d: Device) => {
    const h = heightAt(d)
    return h ? `${sizeAt(d)} ${h}` : sizeAt(d)
  }

  // Dark mode can want the tile at a different size - a pattern with more air in
  // it usually needs to be bigger to read the same against a dark background.
  // A device with no dark value of its own resolves the normal way (desktop ->
  // tablet -> mobile) and only falls through to the LIGHT size once that cascade
  // comes up empty - never to 'auto', which would quietly undo the light size.
  const darkSizeRv = normalizeResponsiveValue<string>(props.patternSizeDark)
  const hasDarkSize = DEVICES.some((d) => (darkSizeRv[d] ?? '').trim() !== '')
  const darkSizeAt = (d: Device) => {
    const raw = (pickResponsive(darkSizeRv, d) ?? '').trim()
    return raw ? cssSize(raw) : sizeAt(d)
  }

  // Same rule for the height: blank in dark mode means "whatever light does",
  // which includes light's own blank - a dark tile at a different width still
  // wants a matching whole-pixel height, and the author has to give it one.
  const darkHeightRv = normalizeResponsiveValue<string>(props.patternHeightDark)
  const hasDarkHeight = DEVICES.some((d) => (darkHeightRv[d] ?? '').trim() !== '')
  const darkHeightAt = (d: Device) => {
    const raw = (pickResponsive(darkHeightRv, d) ?? '').trim()
    return raw ? cssSize(raw) : heightAt(d)
  }
  const darkPairAt = (d: Device) => {
    const h = darkHeightAt(d)
    return h ? `${darkSizeAt(d)} ${h}` : darkSizeAt(d)
  }
  const hasDarkSizing = hasDarkSize || hasDarkHeight

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
      `background-image:${light};background-repeat:repeat;background-position:0 0;background-size:${pairAt('desktop')};}`,
  ]

  // Mirrors the dark-mode logo swap in globals.css: the explicit `data-theme`
  // arm covers a visitor who has chosen a theme, the media query covers the
  // "follow my system" default, where nothing is stamped on <html> at all.
  if (dark || hasDarkSizing) {
    const chosen = `[data-theme="dark"] ${selector}`
    const system = `:root:not([data-theme="light"]) ${selector}`
    // The size carries !important because the light breakpoint rules below do
    // (they have to beat an inline style on other blocks, see
    // responsiveMediaCssFor) and an important declaration beats a plain one
    // whatever the specificity. The image needs none: nothing else sets it.
    const decls = (d: Device) =>
      `${dark ? `background-image:${dark};` : ''}${hasDarkSizing ? `background-size:${darkPairAt(d)} !important;` : ''}`
    rules.push(`${chosen}{${decls('desktop')}}`)
    rules.push(`@media(prefers-color-scheme:dark){${system}{${decls('desktop')}}}`)

    // Breakpoints, for the dark size only - the image does not change with the
    // viewport. A breakpoint whose resolved dark size matches desktop's emits
    // nothing, same rule responsiveMediaCssFor follows.
    if (hasDarkSizing) {
      for (const [query, device] of [[tabletMediaQuery(), 'tablet'], [mobileMediaQuery(), 'mobile']] as const) {
        if (darkPairAt(device) === darkPairAt('desktop')) continue
        const decl = `background-size:${darkPairAt(device)} !important;`
        rules.push(`${query}{${chosen}{${decl}}}`)
        // Nested @media is not something every browser this has to run in
        // supports, so the two conditions are combined into one query instead.
        rules.push(`@media(prefers-color-scheme:dark) and ${query.replace(/^@media\s*/, '')}{${system}{${decl}}}`)
      }
    }
  }

  const sizeCss = responsiveMediaCssFor(selector, (d) => `background-size:${pairAt(d)};`)
  if (sizeCss) rules.push(sizeCss)

  return rules.join('\n')
}
