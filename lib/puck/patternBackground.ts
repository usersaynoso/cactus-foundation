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

import {
  normalizeResponsiveValue,
  pickResponsive,
  responsiveMediaCssFor,
  type Device,
  type ResponsiveValue,
} from '@/lib/puck/responsiveValue'

export type PatternProps = {
  patternImage?: string
  patternImageDark?: string
  patternSize?: ResponsiveValue<string> | string
}

// Everything below is interpolated straight into a <style> tag, so both the URL
// and the size are allow-listed rather than escaped. A media URL is either a
// same-origin path or an http(s) address and never contains a quote, a bracket,
// a backslash or whitespace; anything that does is a value we didn't produce, so
// the pattern is dropped rather than rendered. Failing closed here is the point:
// a rejected pattern is a missing decoration, an accepted one could close the
// declaration and inject arbitrary CSS into the page.
function cssUrl(raw: string | undefined): string | null {
  const url = (raw ?? '').trim()
  if (!url) return null
  if (!url.startsWith('/') && !/^https?:\/\//i.test(url)) return null
  if (/["'()\\\s;{}]/.test(url)) return null
  return `url("${url}")`
}

const SIZE_RE = /^(auto|cover|contain|\d+(?:\.\d+)?(?:px|rem|em|%|vw|vh))$/

function cssSize(raw: string | undefined): string {
  const v = (raw ?? '').trim()
  return SIZE_RE.test(v) ? v : 'auto'
}

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
export function patternHostStyle(props: PatternProps): { isolation: 'isolate'; overflow: 'hidden'; position: 'relative' } | Record<string, never> {
  if (!hasPattern(props)) return {}
  return { isolation: 'isolate', overflow: 'hidden', position: 'relative' }
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

  const rules: string[] = [
    `${selector}{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;border-radius:inherit;` +
      `background-image:${light};background-repeat:repeat;background-position:center;background-size:${sizeAt('desktop')};}`,
  ]

  // Mirrors the dark-mode logo swap in globals.css: the explicit `data-theme`
  // arm covers a visitor who has chosen a theme, the media query covers the
  // "follow my system" default, where nothing is stamped on <html> at all.
  if (dark) {
    rules.push(`[data-theme="dark"] ${selector}{background-image:${dark};}`)
    rules.push(`@media(prefers-color-scheme:dark){:root:not([data-theme="light"]) ${selector}{background-image:${dark};}}`)
  }

  const sizeCss = responsiveMediaCssFor(selector, (d) => `background-size:${sizeAt(d)};`)
  if (sizeCss) rules.push(sizeCss)

  return rules.join('\n')
}
