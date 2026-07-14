// Menu "Scale (%)" - shared by every place a menu renders (the live MenuBlock in
// config.tsx, MenuBlockClient's horizontal markup, and the two editors'
// MenuBlockEditorPreview), so the editor canvas and the published page can't
// drift apart.
//
// CSS `zoom`, not `transform: scale()`, deliberately: zoom scales the element's
// LAYOUT box, so a menu set to 50% genuinely takes half the room in the header
// row and its neighbours close up around it. A transform only paints it smaller
// while the full-size slot stays reserved, leaving a hole beside it.
import {
  normalizeResponsiveValue,
  pickResponsive,
  responsiveMediaCssFor,
  type Device,
  type ResponsiveValue,
} from '@/lib/puck/responsiveValue'

// Percent, not a factor - the field is labelled "Scale (%)" and 100 means "as
// designed". Anything unparseable (blank, zero, negative) falls back to 100
// rather than collapsing the menu to nothing; the ceiling stops a stray extra
// digit blowing the header apart.
function pct(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''))
  if (!Number.isFinite(n) || n <= 0) return 100
  return Math.min(400, Math.max(10, n))
}

// The class goes on every top-level piece of the menu - the inline list, the
// hamburger button, the dropdown trigger - since they are siblings, not one
// wrapped box. The hamburger's drawer is left alone on purpose: it is a
// full-bleed panel pinned to the header's edges, so zooming it would halve its
// width rather than shrink its contents.
export function menuScaleStyles(
  blockId: string | undefined,
  scale: ResponsiveValue<number> | number | undefined,
): { className: string; css: string } {
  if (!blockId) return { className: '', css: '' }
  const rv = normalizeResponsiveValue<number>(scale)
  const at = (d: Device) => pct(pickResponsive(rv, d))
  const className = `menu-scale-${blockId}`
  const desktop = at('desktop')
  // Desktop rides in a plain rule (nothing inline competes with it) and
  // tablet/mobile only emit when they differ from desktop - so an unscaled menu
  // emits no CSS at all and renders byte-identically to before.
  const css = [
    desktop !== 100 ? `.${className}{zoom:${desktop / 100};}` : '',
    responsiveMediaCssFor(`.${className}`, (d) => `zoom:${at(d) / 100};`),
  ].filter(Boolean).join('\n')
  return { className, css }
}
