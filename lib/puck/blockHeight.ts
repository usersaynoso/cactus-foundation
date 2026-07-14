// "Block height" - the shared vocabulary behind the Heading and Card blocks'
// height fields, so the two offer the same presets and the same "Fill
// container" behaviour rather than drifting into two half-implementations.

import { responsiveMediaCssFor, type Device } from '@/lib/puck/responsiveValue'

export const BLOCK_HEIGHT_OPTIONS = [
  { value: 'none', label: 'Auto' },
  { value: 'sm', label: 'Small (240px)' },
  { value: 'md', label: 'Medium (400px)' },
  { value: 'lg', label: 'Large (600px)' },
  { value: 'screen', label: 'Full screen' },
  { value: 'fill', label: 'Fill container' },
]

export const BLOCK_HEIGHT_MAP: Record<string, string | undefined> = {
  none: undefined,
  sm: '240px',
  md: '400px',
  lg: '600px',
  screen: '100vh',
}

// A percentage height only resolves against a parent that has one of its own.
// Whatever holds a block on the published page - a Grid column's slot wrapper, a
// Group's flex box - is auto-height, so a block's `height: 100%` would collapse
// straight back to its content height. (It looks right in the editor purely
// because Puck's stylesheet sizes every slot wrapper `height: 100%`, and that
// stylesheet doesn't ship to the live site.) This rule lifts the block's
// immediate parent to full height, scoped to that one block, so the chain
// resolves wherever it was dropped. Inert in the editor, where the wrapper is
// already 100%, and inert under an auto-height parent, where 100% of auto is
// simply auto again.
export function blockFillCss(attribute: string, id: string): string {
  return `*:has(> [${attribute}="${id}"]){height:100%;}`
}

// Per-breakpoint sibling of blockFillCss, for blocks whose height field is
// responsive: lifts the parent only at the breakpoints where "Fill container"
// is actually picked. No base rule is needed when desktop isn't filling - the
// parent's natural height IS auto - so a tablet-only fill emits just the one
// media rule and desktop renders byte-identically to before.
export function blockFillCssResponsive(attribute: string, id: string, fillAt: (d: Device) => boolean): string {
  const sel = `*:has(> [${attribute}="${id}"])`
  const base = fillAt('desktop') ? `${sel}{height:100%;}` : ''
  return base + responsiveMediaCssFor(sel, (d) => `height:${fillAt(d) ? '100%' : 'auto'};`)
}
