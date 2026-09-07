import React from 'react'

// The icon set the Mobile Bar offers. Deliberately its own set rather than a
// share of ICON_LINK_ICONS: that set was drawn for a header icon row (floor
// plans, maps, pins) and carries none of the five a phone bar actually needs,
// while this one has no use for a floor plan. Same geometry family though -
// 24x24 viewBox, 2px round-capped strokes in currentColor - so an Icon Link and
// a bar item sitting on the same page look like siblings.
//
// Rendered identically by the editor and the published (RSC) paths: both import
// this file, neither draws its own SVG.

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

// Size comes from the .cmb-icon rule (var(--cmb-icon)), same trick the Icon Link
// block uses, so the attributes here are only a fallback for a bare render.
const icon = (children: React.ReactNode) => (
  <svg width="24" height="24" viewBox="0 0 24 24" {...stroke} aria-hidden="true">{children}</svg>
)

export const MOBILE_BAR_ICONS: Record<string, { label: string; node: React.ReactNode }> = {
  home:    { label: 'Home',            node: icon(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" /></>) },
  account: { label: 'Person',          node: icon(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>) },
  cart:    { label: 'Trolley',         node: icon(<><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.6 12.1a1.5 1.5 0 0 0 1.5 1.2h8.2a1.5 1.5 0 0 0 1.5-1.2L21 7H6" /></>) },
  bag:     { label: 'Bag',             node: icon(<><path d="M5 8h14l-1 12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>) },
  menu:    { label: 'Menu (three bars)', node: icon(<><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>) },
  chat:    { label: 'Speech bubble',   node: icon(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />) },
  phone:   { label: 'Telephone',       node: icon(<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />) },
  search:  { label: 'Magnifier',       node: icon(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>) },
  heart:   { label: 'Heart',           node: icon(<path d="M19.5 12.6 12 20l-7.5-7.4a5 5 0 1 1 7-7.1l.5.5.5-.5a5 5 0 1 1 7 7.1z" />) },
  star:    { label: 'Star',            node: icon(<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z" />) },
  grid:    { label: 'Grid of squares', node: icon(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>) },
  pin:     { label: 'Location pin',    node: icon(<><path d="M12 21s-7-5.1-7-11a7 7 0 0 1 14 0c0 5.9-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>) },
  info:    { label: 'Info',            node: icon(<><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M12 12v4" /></>) },
  mail:    { label: 'Envelope',        node: icon(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 6.5 8.5 6 8.5-6" /></>) },
}

export const MOBILE_BAR_ICON_OPTIONS = Object.entries(MOBILE_BAR_ICONS)
  .map(([value, { label }]) => ({ value, label }))

/** The drawn icon, or null for a name nothing recognises - a bar item with no
 *  icon still shows its label rather than collapsing to nothing. */
export function mobileBarIcon(name: string | undefined): React.ReactNode {
  if (!name) return null
  return MOBILE_BAR_ICONS[name]?.node ?? null
}

/** The editor's stand-in for a cell a module fills in for itself. Dashed, so it
 *  reads as "something goes here" rather than as an icon somebody chose. */
export const MODULE_SLOT_ICON = (
  <svg width="24" height="24" viewBox="0 0 24 24" {...stroke} strokeDasharray="3 3" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="4" />
  </svg>
)
