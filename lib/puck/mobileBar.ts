// Shared contract and stylesheet for the Mobile Bar block - the phone-style bar
// of icons pinned to the bottom of the screen.
//
// Client-safe on purpose: the editor half (lib/puck/config.core.tsx), the
// published half (lib/puck/config.rsc.tsx) and the client island
// (components/MobileBarClient.tsx) all read this one file, so there is exactly
// one description of what a bar item is and one stylesheet drawing it. That is
// what keeps the editor canvas and the live page identical.
//
// It is also the contract a MODULE builds against. A module contributing an item
// (the shop's basket, live chat's message button) renders its own button using
// the class names below and nothing else: core owns the chrome, the module owns
// the icon, the badge and what a press does. See `core.mobile-bar-items` in
// wiki/Authoring-a-module.md.
import { mobileMediaQuery, tabletMediaQuery } from '@/lib/puck/responsiveValue'

export type MobileBarItemKind = 'link' | 'menu' | 'account' | 'module'

/** One cell of the bar, as the owner configured it. */
export type MobileBarItemProps = {
  kind?: MobileBarItemKind
  label?: string
  icon?: string
  /** kind 'link' */
  href?: string
  newTab?: string
  /** kind 'menu' - blank means the site's main menu, same rule the Menu block uses. */
  menuId?: string
  /** kind 'menu' - heading printed at the top of the panel that slides up. */
  sheetHeading?: string
  /** kind 'module' - the id a module declared for the `core.mobile-bar-items` point. */
  moduleItemId?: string
}

/** Which screens the bar appears on. A bar the owner has switched off at a
 *  breakpoint takes no height there either, so nothing pads the page for it. */
export type MobileBarVisibility = 'mobile' | 'mobileTablet' | 'all'

export type MobileBarStyleProps = {
  barOn?: MobileBarVisibility
  bgColour?: string
  borderColour?: string
  itemColour?: string
  activeColour?: string
  badgeBg?: string
  badgeText?: string
  iconSize?: number
  labelSize?: number
  height?: number
  showLabels?: 'yes' | 'no'
}

export const MOBILE_BAR_DEFAULTS: Required<Omit<MobileBarStyleProps, never>> = {
  barOn: 'mobile',
  bgColour: '',
  borderColour: '',
  itemColour: '',
  activeColour: '',
  badgeBg: 'var(--color-primary)',
  badgeText: 'var(--color-on-primary)',
  iconSize: 22,
  labelSize: 11,
  height: 60,
  showLabels: 'yes',
}

/** A menu item flattened for the panel. Same shape resolveMenu already returns,
 *  narrowed to what the panel draws. */
export type MobileBarMenuItem = {
  id: string
  label: string
  url?: string | null
  newTab?: boolean | null
  children?: MobileBarMenuItem[]
}

/** What core hands a module's item component. Deliberately tiny: everything
 *  else the module needs (its own colours, its own icon) is the module's, and
 *  everything core owns arrives as CSS custom properties on the bar itself. */
export type ModuleMobileBarItemProps = {
  /** The label the owner typed for this cell, already trimmed. Print it in a
   *  `<span className="cmb-label">` so it lines up with core's own items. */
  label: string
  /** Icon edge length in px, from the bar's settings. */
  iconSize: number
  /** 'no' when the owner has switched labels off for the whole bar. */
  showLabels: 'yes' | 'no'
}

const BAR_Z = 900

/** The media query wrapping everything the bar paints, for the breakpoints it
 *  is switched on at. `all` needs no query at all. */
function visibilityWrap(barOn: MobileBarVisibility, css: string): string {
  if (barOn === 'all') return css
  if (barOn === 'mobileTablet') return `${mobileMediaQuery()}{${css}}\n${tabletMediaQuery()}{${css}}`
  return `${mobileMediaQuery()}{${css}}`
}

/**
 * The bar's whole stylesheet, scoped to one block id.
 *
 * Everything is emitted inside the visibility query rather than painted as a
 * base style and hidden again, so a bar set to phones only adds not one
 * declaration to a desktop page - including the body padding that stops the bar
 * covering the last of the content. A page whose owner has no bar is untouched.
 */
export function mobileBarCss(barId: string, props: MobileBarStyleProps): string {
  const p = { ...MOBILE_BAR_DEFAULTS, ...props }
  const sel = `[data-cmb-id="${barId}"]`
  const height = Math.max(36, Math.min(140, p.height || MOBILE_BAR_DEFAULTS.height))
  const iconSize = Math.max(12, Math.min(48, p.iconSize || MOBILE_BAR_DEFAULTS.iconSize))
  const labelSize = Math.max(7, Math.min(20, p.labelSize || MOBILE_BAR_DEFAULTS.labelSize))

  // The bar itself, its cells, and the panel that slides up from it.
  const bar = `
${sel}{
  --cmb-h:${height}px;
  --cmb-icon:${iconSize}px;
  --cmb-label:${labelSize}px;
  --cmb-fg:${p.itemColour || 'var(--color-text-muted, #6b7280)'};
  --cmb-active:${p.activeColour || 'var(--color-primary)'};
  --cmb-bg:${p.bgColour || 'var(--color-surface, #fff)'};
  --cmb-border:${p.borderColour || 'var(--color-border, #e5e7eb)'};
  --cmb-badge-bg:${p.badgeBg || MOBILE_BAR_DEFAULTS.badgeBg};
  --cmb-badge-fg:${p.badgeText || MOBILE_BAR_DEFAULTS.badgeText};
  position:fixed;left:0;right:0;bottom:0;z-index:${BAR_Z};
  display:block;
  background:var(--cmb-bg);
  border-top:1px solid var(--cmb-border);
  padding-bottom:env(safe-area-inset-bottom,0px);
  box-sizing:border-box;
}
${sel} .cmb-list{
  list-style:none;margin:0;padding:0;
  display:grid;grid-auto-flow:column;grid-auto-columns:1fr;
  height:var(--cmb-h);
}
${sel} .cmb-cell{display:flex;min-width:0;}
${sel} .cmb-item{
  flex:1;min-width:0;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:3px;
  position:relative;
  padding:4px 2px;
  background:none;border:0;border-radius:0;
  font:inherit;color:var(--cmb-fg);
  text-decoration:none;cursor:pointer;
  -webkit-tap-highlight-color:transparent;
}
${sel} .cmb-icon{
  display:flex;align-items:center;justify-content:center;
  width:var(--cmb-icon);height:var(--cmb-icon);
  position:relative;
}
${sel} .cmb-icon>svg{width:100%;height:100%;display:block;}
${sel} .cmb-label{
  font-size:var(--cmb-label);line-height:1.1;font-weight:500;
  max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
}
${sel} .cmb-item[data-cmb-active="true"]{color:var(--cmb-active);}
${sel} .cmb-item:focus-visible{outline:2px solid var(--cmb-active);outline-offset:-2px;}
${sel} .cmb-badge{
  position:absolute;top:-6px;left:calc(50% + 4px);
  min-width:16px;height:16px;padding:0 4px;box-sizing:border-box;
  display:flex;align-items:center;justify-content:center;
  border-radius:9999px;
  background:var(--cmb-badge-bg);color:var(--cmb-badge-fg);
  font-size:10px;font-weight:700;line-height:1;
}
body{padding-bottom:calc(${height}px + env(safe-area-inset-bottom,0px));}
/* What the bar covers, published for anything else pinned to the bottom of the
   viewport to clear itself by: a chat bubble, a cookie strip, a module's own
   sticky footer. Padding cannot help those - they are fixed, so the page's
   padding is not theirs. Read it as var(--cactus-bottom-bar-offset, 0px) and a
   site with no bar (or a breakpoint the bar is off at) is unaffected. */
:root{--cactus-bottom-bar-offset:calc(${height}px + env(safe-area-inset-bottom,0px));}
`.trim()

  // The panel core itself opens: a menu, sliding up, full width. Modules that
  // open something of their own (the basket, the chat widget) draw their own.
  const sheet = `
${sel} .cmb-scrim{
  position:fixed;inset:0;z-index:${BAR_Z - 2};
  background:rgba(0,0,0,0.4);
  border:0;padding:0;margin:0;width:100%;
  opacity:0;visibility:hidden;pointer-events:none;
  transition:opacity 200ms ease-out,visibility 0s linear 200ms;
}
${sel} .cmb-scrim[data-cmb-open="true"]{
  opacity:1;visibility:visible;pointer-events:auto;
  transition:opacity 200ms ease-out,visibility 0s;
}
${sel} .cmb-sheet{
  position:fixed;left:0;right:0;
  bottom:calc(var(--cmb-h) + env(safe-area-inset-bottom,0px));
  z-index:${BAR_Z - 1};
  max-height:70vh;overflow-y:auto;
  background:var(--cmb-bg);color:var(--color-text);
  border-top:1px solid var(--cmb-border);
  border-radius:14px 14px 0 0;
  box-shadow:0 -8px 24px rgba(0,0,0,0.18);
  transform:translateY(100%);
  visibility:hidden;
  transition:transform 240ms ease-out,visibility 0s linear 240ms;
  overscroll-behavior:contain;
}
${sel} .cmb-sheet[data-cmb-open="true"]{
  transform:translateY(0);visibility:visible;
  transition:transform 240ms ease-out,visibility 0s;
}
${sel} .cmb-sheet-head{
  display:flex;align-items:center;justify-content:space-between;gap:0.5rem;
  padding:0.75rem 1rem 0.5rem;
}
${sel} .cmb-sheet-title{margin:0;font-size:1rem;font-weight:600;color:var(--color-text);}
${sel} .cmb-sheet-close{
  background:none;border:0;padding:0.25rem;line-height:0;cursor:pointer;
  color:var(--color-text-muted, #6b7280);
}
${sel} .cmb-sheet-body{padding:0 0.5rem 1rem;}
@media(prefers-reduced-motion:reduce){
  ${sel} .cmb-sheet,${sel} .cmb-scrim{transition:none;}
}
`.trim()

  return visibilityWrap(p.barOn ?? 'mobile', `${bar}\n${sheet}`)
}
