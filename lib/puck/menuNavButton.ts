// Menu "Dropdown button width" - the width of the collapsed "Dropdown (current
// page)" trigger, per breakpoint. Lives beside menuScale.ts and for the same
// reason: the rule has to come out identical wherever a menu renders (the live
// MenuBlock, MenuBlockClient's own markup, the two editors' preview), so the
// editor canvas and the published page can't drift apart.
import {
  normalizeResponsiveValue,
  pickResponsive,
  responsiveMediaCssFor,
  type Device,
  type ResponsiveValue,
} from '@/lib/puck/responsiveValue'

// 'full' spans the slot the block was dropped into, so a trigger stacked above a
// full-width neighbour (a search box, most often) lines up with it instead of
// sitting in a short stub. A filled trigger also sends its bars to the far edge,
// the way a select control does - grouped against the label they would leave the
// rest of the button looking like dead space.
//
// At 'auto' (the default, and how the trigger has always rendered) the button is
// exactly as wide as its contents, so there is no free space for either
// justify-content value to distribute and the two render identically. That is
// what makes this safe to emit for menus nobody has touched.
export function navButtonWidthCss(
  blockId: string | undefined,
  navButtonWidth: ResponsiveValue<string> | string | undefined,
): string {
  if (!blockId) return ''
  const rv = normalizeResponsiveValue<string>(navButtonWidth)
  const isFull = (d: Device) => pickResponsive(rv, d) === 'full'
  const declAt = (d: Device) => (isFull(d) ? 'width:100%;justify-content:space-between;' : 'width:auto;justify-content:flex-start;')
  const selector = `[data-menu-dd-id="${blockId}"] > button`
  // Desktop rides a plain rule (nothing inline competes with it) and
  // tablet/mobile only emit when they differ - so a menu left on 'auto'
  // everywhere emits no CSS at all.
  return [
    isFull('desktop') ? `${selector}{${declAt('desktop')}}` : '',
    responsiveMediaCssFor(selector, declAt),
  ].filter(Boolean).join('\n')
}
