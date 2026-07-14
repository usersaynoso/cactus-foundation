'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { fluidClamp, normalizeResponsiveValue, pickResponsive, responsiveMediaCssFor, type ResponsiveValue } from '@/lib/puck/responsiveValue'
import { menuScaleStyles } from '@/lib/puck/menuScale'
import { googleFontHrefForFamily } from '@/lib/design/tokens'
import { emailSafeHref, maskEmailText } from '@/lib/email-obfuscate'

// A menu item pointing at "mailto:hi@example.com" gets the same spam protection
// as an address typed into page copy: the mailto never reaches the served HTML,
// and the client deobfuscator wires the href up after load (lib/email-obfuscate).
// Unlike the blocks in config.tsx this doesn't skip the protection in the editor -
// it has no access to Puck's editing flag, and there is nothing to skip for: the
// address is edited in the menu form, not by clicking the rendered link, and the
// label reads identically either way. Editor and published markup stay identical,
// which is the invariant we want anyway.

// Which edge the collapsed menu sits against: where the hamburger button and the
// "Dropdown (current page)" trigger sit in the slot the block was dropped into,
// the hamburger drawer's item text, and the side the dropdown panel hangs from.
export type MenuDropAlign = 'left' | 'center' | 'right'

function toDropAlign(v: unknown): MenuDropAlign {
  return v === 'center' || v === 'right' ? v : 'left'
}

const FLEX_PLACE: Record<MenuDropAlign, string> = { left: 'flex-start', center: 'center', right: 'flex-end' }

// Placing the collapsed control itself takes two mechanisms, because it lands in
// one of two very different parents and each mechanism is inert exactly where the
// other bites.
//
// Dropped into a Grid column (or any plain slot) the control's parent is a block,
// so the control - which the breakpoint rules in tokens.ts flip to `display:flex`
// - is a block-level flex box that fills the column's width. Its own
// justify/align therefore places the button inside it, while these auto margins
// resolve to zero against the auto width. Dropped into a Group the parent is
// itself a flex row, so the control shrink-wraps to a flex item: now the auto
// margins place the box, and there is no free space left inside it for
// justify/align to distribute. Both are set, and between them every parent is
// covered. 'left' emits no margins at all, so the default renders as before.
function dropAlignMargins(align: MenuDropAlign): React.CSSProperties {
  if (align === 'center') return { marginLeft: 'auto', marginRight: 'auto' }
  if (align === 'right') return { marginLeft: 'auto' }
  return {}
}

type MenuItem = {
  id: string
  label: string
  href: string
  openInNewTab: boolean
  children?: MenuItem[]
}

export type MenuLinkColours = {
  hoverColor?: string
  hoverBackground?: string
  activeColor?: string
  activeUnderline?: string // 'none' | 'underline'
  activeUnderlineColor?: string
  activeUnderlineThickness?: string
  activeUnderlineOffset?: string
  activeFontWeight?: string // '' | 'normal' | 'medium' | 'semibold' | 'bold'
}

// Bare numbers are px; anything with a unit passes through untouched.
function cssLen(v: string | undefined, fallback: string): string {
  if (!v) return fallback
  return /^\d+(\.\d+)?$/.test(v.trim()) ? `${v.trim()}px` : v.trim()
}

// Active = exact path match only (no parent-path highlighting). Only relative
// hrefs can ever match; external URLs are never "the current page".
function isActiveHref(href: string, pathname: string | null): boolean {
  if (!pathname || !href || !href.startsWith('/')) return false
  const norm = (p: string) => (p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p)
  return norm(href.split(/[?#]/)[0] ?? href) === norm(pathname)
}

function activeDecoration(colours?: MenuLinkColours): React.CSSProperties {
  const weight = colours?.activeFontWeight ? { fontWeight: fontWeightMap[colours.activeFontWeight] } : {}
  if (colours?.activeUnderline !== 'underline') return weight
  return {
    ...weight,
    textDecoration: 'underline',
    textDecorationThickness: cssLen(colours.activeUnderlineThickness, '2px'),
    textUnderlineOffset: cssLen(colours.activeUnderlineOffset, '4px'),
    ...(colours.activeUnderlineColor ? { textDecorationColor: colours.activeUnderlineColor } : {}),
  }
}

// Vertical menus render server-side in config.tsx's MenuBlock, which can't know
// the current path - this client anchor carries the hover/active styling there.
export function MenuVerticalLink({ item, className, style, colours }: {
  item: MenuItem
  className?: string
  style?: React.CSSProperties
  colours?: MenuLinkColours
}) {
  const [hovered, setHovered] = useState(false)
  const pathname = usePathname()
  const active = isActiveHref(item.href, pathname)
  const colour = hovered && colours?.hoverColor ? colours.hoverColor
    : active && colours?.activeColor ? colours.activeColor
    : undefined
  return (
    <a
      {...emailSafeHref(item.href)}
      target={item.openInNewTab ? '_blank' : undefined}
      rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
      className={className}
      aria-current={active ? 'page' : undefined}
      style={{ ...style, ...(colour ? { color: colour } : {}), ...(active ? activeDecoration(colours) : {}), transition: 'color 0.15s' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {maskEmailText(item.label)}
    </a>
  )
}

const DROPDOWN_PANEL: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  left: 0,
  // The panel is absolutely positioned inside a narrow <li>, so without an
  // explicit width it shrink-to-fits to that li and comes out cramped.
  // max-content sizes it to its longest row; minWidth stops tiny menus looking
  // mean, maxWidth stops a very long label running off the page.
  minWidth: 180,
  width: 'max-content',
  maxWidth: 320,
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  listStyle: 'none',
  margin: 0,
  padding: '0.375rem 0',
  zIndex: 100,
}

const SUBDROPDOWN_PANEL: React.CSSProperties = {
  ...DROPDOWN_PANEL,
  top: '-0.375rem',
  left: '100%',
  zIndex: 101,
}

function DropdownLink({ item, hasChildren, colours, fontFamily, onToggle }: { item: MenuItem; hasChildren: boolean; colours?: MenuLinkColours; fontFamily?: string; onToggle?: () => void }) {
  const [hovered, setHovered] = useState(false)
  const pathname = usePathname()
  const active = isActiveHref(item.href, pathname)
  return (
    <a
      {...emailSafeHref(item.href)}
      target={item.openInNewTab ? '_blank' : undefined}
      rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
      aria-current={active ? 'page' : undefined}
      onClick={onToggle ? (e) => { e.preventDefault(); onToggle() } : undefined}
      style={{
        display: hasChildren ? 'flex' : 'block',
        justifyContent: hasChildren ? 'space-between' : undefined,
        alignItems: hasChildren ? 'center' : undefined,
        whiteSpace: 'nowrap',
        padding: '0.5rem 1rem',
        fontSize: '0.9rem',
        fontFamily,
        color: hovered ? (colours?.hoverColor || 'var(--color-primary)') : (active && colours?.activeColor) ? colours.activeColor : 'var(--color-text)',
        background: hovered ? (colours?.hoverBackground || 'var(--color-primary-subtle)') : 'transparent',
        textDecoration: 'none',
        transition: 'color 0.15s, background 0.15s',
        ...(active ? activeDecoration(colours) : {}),
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {maskEmailText(item.label)}
      {hasChildren && (
        <span style={{ opacity: 0.5, fontSize: '0.7rem', marginLeft: '0.5rem' }} aria-hidden>▸</span>
      )}
    </a>
  )
}

function DesktopNavItem({ item, overrides, colours, fontFamily, openOn = 'hover', depth = 0 }: {
  item: MenuItem
  overrides?: React.CSSProperties
  colours?: MenuLinkColours
  fontFamily?: string
  openOn?: string // 'hover' | 'click'
  depth?: number
}) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const pathname = usePathname()
  const liRef = useRef<HTMLLIElement>(null)
  const hasChildren = !!item.children?.length
  const active = isActiveHref(item.href, pathname)
  const clickMode = openOn === 'click'

  // Click mode keeps a dropdown open until the visitor clicks elsewhere -
  // hover mode closes on mouseleave, so only click mode needs this listener.
  useEffect(() => {
    if (!clickMode || !open) return
    function handler(e: MouseEvent) {
      if (liRef.current && !liRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [clickMode, open])

  if (depth === 0) {
    return (
      <li
        ref={liRef}
        style={{ position: 'relative' }}
        onMouseEnter={() => !clickMode && hasChildren && setOpen(true)}
        onMouseLeave={() => { if (!clickMode) setOpen(false); setHovered(false) }}
      >
        <a
          {...emailSafeHref(item.href)}
          target={item.openInNewTab ? '_blank' : undefined}
          rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
          className="cactus-nav-link"
          aria-current={active ? 'page' : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0.5rem 0.875rem',
            fontSize: overrides?.fontSize ?? '0.9375rem',
            fontWeight: overrides?.fontWeight ?? 500,
            fontFamily,
            textTransform: overrides?.textTransform,
            letterSpacing: overrides?.letterSpacing,
            color: hovered ? (colours?.hoverColor || 'var(--color-primary)') : (active && colours?.activeColor) ? colours.activeColor : (overrides?.color ?? 'var(--color-text)'),
            background: hovered ? (colours?.hoverBackground || 'var(--color-primary-subtle)') : 'transparent',
            textDecoration: 'none',
            borderRadius: 6,
            transition: 'color 0.15s, background 0.15s',
            ...(active ? activeDecoration(colours) : {}),
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onClick={(e) => {
            if (clickMode && hasChildren) { e.preventDefault(); setOpen(o => !o) }
            else setOpen(false)
          }}
        >
          {maskEmailText(item.label)}
          {hasChildren && (
            <span style={{ fontSize: '0.625rem', opacity: 0.6 }} aria-hidden>▾</span>
          )}
        </a>
        {hasChildren && open && (
          <ul style={DROPDOWN_PANEL}>
            {item.children!.map((child) => (
              <DesktopNavItem key={child.id} item={child} colours={colours} fontFamily={fontFamily} openOn={openOn} depth={1} />
            ))}
          </ul>
        )}
      </li>
    )
  }

  return (
    <li
      ref={liRef}
      style={{ position: 'relative' }}
      onMouseEnter={() => !clickMode && hasChildren && setOpen(true)}
      onMouseLeave={() => !clickMode && setOpen(false)}
    >
      <DropdownLink item={item} hasChildren={hasChildren} colours={colours} fontFamily={fontFamily} onToggle={clickMode && hasChildren ? () => setOpen(o => !o) : undefined} />
      {hasChildren && open && (
        <ul style={SUBDROPDOWN_PANEL}>
          {item.children!.map((child) => (
            <DesktopNavItem key={child.id} item={child} colours={colours} fontFamily={fontFamily} openOn={openOn} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

function MobileNavItem({ item, onClose, colours, fontFamily, depth = 0, align = 'left' }: {
  item: MenuItem
  onClose: () => void
  colours?: MenuLinkColours
  fontFamily?: string
  depth?: number
  align?: MenuDropAlign
}) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const pathname = usePathname()
  const hasChildren = !!item.children?.length
  const active = isActiveHref(item.href, pathname)
  // Anything but left-aligned skips the depth-based indent - asymmetric left
  // padding would throw off a centred or right-aligned row - and keeps every
  // level at the same flat 1.5rem inset instead.
  const pl = align !== 'left' ? '1.5rem' : (depth > 0 ? `${depth + 1}rem` : '1.5rem')

  return (
    <div style={align !== 'left' ? { textAlign: align } : undefined}>
      <div
        style={{ padding: `0 1.5rem 0 ${pl}`, cursor: hasChildren ? 'pointer' : undefined }}
        onClick={() => hasChildren && setOpen((o) => !o)}
      >
        {hasChildren ? (
          <span style={{
            display: 'block',
            padding: '0.625rem 0',
            fontSize: '1rem',
            fontWeight: 500,
            fontFamily,
            color: 'var(--color-text)',
            borderBottom: '1px solid var(--color-border)',
          }}>
            {maskEmailText(item.label)} {open ? '▴' : '▾'}
          </span>
        ) : (
          <a
            {...emailSafeHref(item.href)}
            target={item.openInNewTab ? '_blank' : undefined}
            rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
            aria-current={active ? 'page' : undefined}
            style={{
              display: 'block',
              padding: '0.625rem 0',
              fontSize: '1rem',
              fontWeight: 500,
              fontFamily,
              color: hovered ? (colours?.hoverColor || 'var(--color-primary)') : (active && colours?.activeColor) ? colours.activeColor : 'var(--color-text)',
              textDecoration: 'none',
              borderBottom: '1px solid var(--color-border)',
              transition: 'color 0.15s',
              ...(active ? activeDecoration(colours) : {}),
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={onClose}
          >
            {maskEmailText(item.label)}
          </a>
        )}
      </div>
      {hasChildren && open && (
        <div>
          {item.children!.map((child) => (
            <MobileNavItem key={child.id} item={child} onClose={onClose} colours={colours} fontFamily={fontFamily} depth={depth + 1} align={align} />
          ))}
        </div>
      )}
    </div>
  )
}

// Walks the menu (one level of children too) for the item matching the current
// path, so the "Dropdown" nav trigger can label itself with the page you're on.
// Falls back to the supplied label when nothing matches (e.g. a page that isn't
// in this menu at all).
function currentPageLabel(items: MenuItem[], pathname: string | null, fallback: string): string {
  for (const item of items) {
    if (isActiveHref(item.href, pathname)) return item.label
    const child = item.children?.find((c) => isActiveHref(c.href, pathname))
    if (child) return child.label
  }
  return fallback
}

// "Dropdown" nav behaviour: a single button showing the current page, with a
// hamburger icon on the right that opens the full (centre-aligned) menu below
// it. Hidden by default (display:none); buildTokenStyles' breakpoint rules
// reveal it via the cactus-nav-dd-* classes at whichever widths chose this
// mode. Reuses MobileNavItem for the panel so the nested accordion behaves
// like the hamburger drawer, just centred.
function NavDropdown({ items, colours, fontFamily, className, fallbackLabel, panelAlign = 'left' }: {
  items: MenuItem[]
  colours?: MenuLinkColours
  fontFamily?: string
  className: string
  fallbackLabel: string
  panelAlign?: MenuDropAlign
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const ref = useRef<HTMLDivElement>(null)
  const current = currentPageLabel(items, pathname, fallbackLabel)
  // Which edge of the trigger the panel hangs from. It used to be pinned to
  // `left: 0` with no way to move it, which on a right-hand trigger threw the
  // panel out towards the middle of the page. The panel is absolute inside the
  // wrapper below, so it follows the trigger wherever that wrapper's
  // justifyContent puts it. The rows inside stay centred - that is this mode's
  // look, and it is what every existing dropdown menu already renders.
  const panelPos: React.CSSProperties = panelAlign === 'center'
    ? { left: '50%', transform: 'translateX(-50%)' }
    : panelAlign === 'right'
      ? { right: 0 }
      : { left: 0 }

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className={className} style={{ position: 'relative', display: 'none', alignItems: 'center', justifyContent: FLEX_PLACE[panelAlign], ...dropAlignMargins(panelAlign) }}>
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          padding: '0.5rem 0.875rem',
          fontSize: '0.9375rem',
          fontWeight: 500,
          fontFamily,
          color: 'var(--color-text)',
          background: 'none',
          border: '1px solid var(--color-border)',
          borderRadius: 6,
          cursor: 'pointer',
        }}
      >
        {current}
        <span aria-hidden style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ display: 'block', width: 16, height: 2, background: 'var(--color-text)', borderRadius: 2 }} />
          <span style={{ display: 'block', width: 16, height: 2, background: 'var(--color-text)', borderRadius: 2 }} />
          <span style={{ display: 'block', width: 16, height: 2, background: 'var(--color-text)', borderRadius: 2 }} />
        </span>
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          ...panelPos,
          minWidth: 220,
          width: 'max-content',
          maxWidth: 320,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 6,
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          paddingTop: '0.375rem',
          paddingBottom: '0.375rem',
          zIndex: 100,
        }}>
          {items.map((item) => (
            <MobileNavItem key={item.id} item={item} onClose={() => setOpen(false)} colours={colours} fontFamily={fontFamily} align="center" />
          ))}
        </div>
      )}
    </div>
  )
}

const fontSizeMap: Record<string, string> = { small: '0.8125rem', medium: '0.9375rem', large: '1.0625rem' }
const fontWeightMap: Record<string, string | number> = { normal: 400, medium: 500, semibold: 600, bold: 700 }
const hGapMap: Record<string, string> = { tight: '0', normal: '0', wide: '0.5rem' }

type MinMaxPair = { min?: string; max?: string }

type Props = {
  blockId?: string
  resolvedItems?: MenuItem[]
  spacing?: ResponsiveValue<string> | 'tight' | 'normal' | 'wide'
  alignment?: ResponsiveValue<string> | 'flex-start' | 'center' | 'space-between' | 'space-around'
  itemFontSize?: ResponsiveValue<string> | 'small' | 'medium' | 'large'
  itemFontWeight?: ResponsiveValue<string> | 'normal' | 'medium' | 'semibold' | 'bold'
  textTransform?: ResponsiveValue<string> | string
  itemColor?: string
  itemFontFamily?: string
  hoverColor?: string
  hoverBackground?: string
  activeColor?: string
  activeUnderline?: string
  activeUnderlineColor?: string
  activeUnderlineThickness?: string
  activeUnderlineOffset?: string
  activeFontWeight?: string
  showDropdowns?: string
  showDesktopToggle?: string
  showMobileToggle?: string
  showTabletToggle?: string
  scale?: ResponsiveValue<number> | number
  dropdownAlign?: string
  fitOneLine?: string
  spacingShrunk?: '' | 'tight' | 'normal' | 'wide'
  itemFontSizeShrunk?: '' | 'small' | 'medium' | 'large'
  itemFontWeightShrunk?: '' | 'normal' | 'medium' | 'semibold' | 'bold'
  itemSpacingFluid?: MinMaxPair
  letterSpacingFluid?: MinMaxPair
  itemFontSizeFluid?: MinMaxPair
  [key: string]: unknown
}

export default function MenuBlockClient({
  blockId,
  resolvedItems,
  spacing = 'normal',
  alignment = 'flex-start',
  itemFontSize = 'medium',
  itemFontWeight = 'medium',
  textTransform = 'none',
  itemColor,
  itemFontFamily,
  hoverColor,
  hoverBackground,
  activeColor,
  activeUnderline = 'none',
  activeUnderlineColor,
  activeUnderlineThickness,
  activeUnderlineOffset,
  activeFontWeight,
  showDropdowns = 'hover',
  showDesktopToggle = 'show',
  showMobileToggle = 'collapse',
  showTabletToggle = 'collapse',
  scale,
  dropdownAlign,
  fitOneLine,
  spacingShrunk,
  itemFontSizeShrunk,
  itemFontWeightShrunk,
  itemSpacingFluid,
  letterSpacingFluid,
  itemFontSizeFluid,
}: Props) {
  const [mobileOpen, setMobileOpen] = useState(false)

  // "Keep on one line": measure what the items need on a single line against the
  // room the list has actually been given, and scale the difference away.
  //
  // Both numbers are LAYOUT metrics of the list itself - `clientWidth` is the box
  // its parent handed it, `scrollWidth` is what its items need with no wrapping -
  // and a CSS transform changes neither. That is the whole reason the shrink is a
  // transform rather than the `zoom` the Scale field uses: zoom would resize the
  // very box being measured, so each pass would feed the next one and the thing
  // would oscillate. The items overflow the list's box in layout terms and are
  // simply painted back inside it, so nothing beside the menu moves.
  const listRef = useRef<HTMLUListElement>(null)
  const [fitScale, setFitScale] = useState(1)
  const fitEnabled = fitOneLine === 'yes'
  const shrunkToFit = fitEnabled && fitScale < 1

  const measureFit = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const avail = el.clientWidth
    const natural = el.scrollWidth
    // A collapsed menu (display:none behind a hamburger) measures zero - leave
    // the last good scale alone rather than snapping it back to full size.
    if (avail <= 0 || natural <= 0) return
    setFitScale(natural > avail ? avail / natural : 1)
  }, [])

  useEffect(() => {
    if (!fitEnabled) return
    const el = listRef.current
    if (!el) return
    measureFit()
    // The list's own box is what changes when the header resizes, so observing
    // it is enough - no window listener needed.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measureFit()) : undefined
    ro?.observe(el)
    // A web font landing after first paint changes what the items need without
    // changing the list's box, so the observer above would never hear about it.
    document.fonts?.ready?.then(() => measureFit()).catch(() => {})
    return () => ro?.disconnect()
    // shrunkToFit is a dependency on purpose: the first pass measures a menu that
    // may still be centred, and a centred flex row that overflows spills equally
    // off both ends, so `scrollWidth` under-reports it. Going into the shrunk
    // state pins the row to flex-start, and re-running here re-measures it
    // honestly. It settles on the second pass and holds.
  }, [fitEnabled, shrunkToFit, resolvedItems, measureFit])

  if (!resolvedItems) {
    return (
      <div style={{ padding: '0.75rem 1rem', background: 'var(--color-bg-subtle)', borderRadius: 6, color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
        Menu — configure in editor
      </div>
    )
  }

  const fluidGap = fluidClamp(itemSpacingFluid?.min, itemSpacingFluid?.max, 'rem')
  const fluidFontSize = fluidClamp(itemFontSizeFluid?.min, itemFontSizeFluid?.max, 'rem')
  const fluidLetterSpacing = fluidClamp(letterSpacingFluid?.min, letterSpacingFluid?.max, 'em')
  // alignment/spacing/font-size/font-weight/text-transform are each a
  // ResponsiveValue: desktop is the inline base, tablet/mobile ride in as
  // !important @media overrides keyed on this block's id (legacy plain-string
  // data normalises to desktop-only, so it renders unchanged and emits no media
  // rules). Cascades desktop→tablet→mobile to match the "Same as desktop/tablet"
  // placeholders ResponsiveSelectField shows.
  const alignRv = normalizeResponsiveValue<string>(alignment)
  const spacingRv = normalizeResponsiveValue<string>(spacing)
  const fontSizeRv = normalizeResponsiveValue<string>(itemFontSize)
  const fontWeightRv = normalizeResponsiveValue<string>(itemFontWeight)
  const transformRv = normalizeResponsiveValue<string>(textTransform)
  const alignBase = pickResponsive(alignRv, 'desktop') ?? 'flex-start'
  const spacingD = pickResponsive(spacingRv, 'desktop') ?? 'normal'
  const fontSizeD = pickResponsive(fontSizeRv, 'desktop') ?? 'medium'
  const fontWeightD = pickResponsive(fontWeightRv, 'desktop') ?? 'medium'
  const transformD = pickResponsive(transformRv, 'desktop') ?? 'none'

  const hGap = fluidGap ?? hGapMap[spacingD] ?? '0'

  // Base rule targets the ul (which carries data-menu-id); the link rules target
  // its top-level anchors only (.cactus-nav-link), matching where `overrides`
  // applies. Font-size is skipped when the fluid clamp owns it; gap when fluid
  // item spacing does.
  const alignCss = blockId ? responsiveMediaCssFor(`[data-menu-id="${blockId}"]`, (d) => {
    const parts = [`justify-content:${pickResponsive(alignRv, d) ?? 'flex-start'};`]
    if (!fluidGap) parts.push(`gap:${hGapMap[pickResponsive(spacingRv, d) ?? 'normal'] ?? '0'};`)
    return parts.join('')
  }) : ''
  const linkCss = blockId ? responsiveMediaCssFor(`[data-menu-id="${blockId}"] .cactus-nav-link`, (d) => {
    const parts: string[] = []
    if (!fluidFontSize) parts.push(`font-size:${fontSizeMap[pickResponsive(fontSizeRv, d) ?? 'medium'] ?? fontSizeMap.medium}`)
    parts.push(`font-weight:${fontWeightMap[pickResponsive(fontWeightRv, d) ?? 'medium'] ?? fontWeightMap.medium}`)
    parts.push(`text-transform:${pickResponsive(transformRv, d) ?? 'none'}`)
    return parts.join(';') + ';'
  }) : ''
  const menuMediaCss = [alignCss, linkCss].filter(Boolean).join('\n')

  const overrides: React.CSSProperties = {}
  if (itemColor) overrides.color = itemColor
  if (fontSizeD !== 'medium') overrides.fontSize = fontSizeMap[fontSizeD]
  if (fontWeightD !== 'medium') overrides.fontWeight = fontWeightMap[fontWeightD]
  if (transformD !== 'none') overrides.textTransform = transformD as React.CSSProperties['textTransform']
  if (fluidFontSize) overrides.fontSize = fluidFontSize
  if (fluidLetterSpacing) overrides.letterSpacing = fluidLetterSpacing

  const hasOverrides = Object.keys(overrides).length > 0
  const colours: MenuLinkColours = { hoverColor, hoverBackground, activeColor, activeUnderline, activeUnderlineColor, activeUnderlineThickness, activeUnderlineOffset, activeFontWeight }
  // React hoists+dedupes precedence-tagged stylesheet links, so a Google font
  // picked on this block alone (outside the site-token fonts buildFontHref
  // loads) still arrives - live site and editor canvas alike.
  const menuFontHref = googleFontHrefForFamily(itemFontFamily)
  // Three nav modes per breakpoint: 'show' (inline menu), 'collapse' (hamburger)
  // and 'dropdown' (current-page trigger). The inline menu hides at any width
  // that isn't 'show' - the collapse-modifier class does that hiding for both
  // replacements - while the hamburger and the dropdown each carry their own
  // class so only the chosen one is revealed at that width.
  const hasItems = resolvedItems.length > 0
  const collapseDesktop = showDesktopToggle !== 'show'
  const collapseMobile = showMobileToggle !== 'show'
  const collapseTablet = showTabletToggle !== 'show'
  const hamburgerDesktop = showDesktopToggle === 'collapse'
  const hamburgerMobile = showMobileToggle === 'collapse'
  const hamburgerTablet = showTabletToggle === 'collapse'
  const dropdownDesktop = showDesktopToggle === 'dropdown'
  const dropdownMobile = showMobileToggle === 'dropdown'
  const dropdownTablet = showTabletToggle === 'dropdown'
  const anyToggle = (collapseDesktop || collapseMobile || collapseTablet) && hasItems
  const showHamburger = (hamburgerDesktop || hamburgerMobile || hamburgerTablet) && hasItems
  const showDropdownNav = (dropdownDesktop || dropdownMobile || dropdownTablet) && hasItems
  // Menu hides wherever the mode isn't 'show'; hamburger/dropdown appear only at
  // the widths that picked them.
  const menuHideModifiers = [collapseDesktop && 'cactus-nav-collapse-desktop', collapseMobile && 'cactus-nav-collapse-mobile', collapseTablet && 'cactus-nav-collapse-tablet'].filter(Boolean)
  const hamburgerModifiers = [hamburgerDesktop && 'cactus-nav-collapse-desktop', hamburgerMobile && 'cactus-nav-collapse-mobile', hamburgerTablet && 'cactus-nav-collapse-tablet'].filter(Boolean)
  const dropdownModifiers = [dropdownDesktop && 'cactus-nav-dd-desktop', dropdownMobile && 'cactus-nav-dd-mobile', dropdownTablet && 'cactus-nav-dd-tablet'].filter(Boolean)
  const menuClasses = ['cactus-nav-menu', ...menuHideModifiers].join(' ')
  const toggleBtnClasses = ['cactus-nav-toggle', ...hamburgerModifiers].join(' ')
  const dropdownNavClasses = ['cactus-nav-dropdown', ...dropdownModifiers].join(' ')

  // The inline list, the hamburger button and the dropdown trigger are siblings
  // (nothing wraps them - the header's own Group/Grid lays them out), so the
  // scale class goes on all three rather than on one box around them.
  const { className: scaleClass, css: scaleCss } = menuScaleStyles(blockId, scale)
  const dropAlign = toDropAlign(dropdownAlign)

  // Two rules, both only while "keep on one line" is on. The links stop wrapping
  // their own labels (a two-word link would otherwise break in half rather than
  // let the row shrink), and a list that has actually been shrunk is pinned to
  // flex-start. The pin needs to beat the per-breakpoint alignment rule above,
  // which carries !important - it wins on specificity, two attribute selectors
  // to one. It costs nothing visually: a shrunk list exactly fills its box, so
  // there is no free space left for any alignment to distribute.
  const fitCss = fitEnabled && blockId ? [
    `[data-menu-id="${blockId}"] .cactus-nav-link{white-space:nowrap;}`,
    `[data-menu-id="${blockId}"][data-menu-fit]{justify-content:flex-start !important;}`,
  ].join('\n') : ''

  // Header "shrink on scroll" support - only emitted when at least one shrunk
  // value is set. Scoped under the header's own data-shrunk toggle (see
  // headerRootRender/HeaderShrinkScroll), so it's a no-op anywhere else this
  // menu is used (footer, other layouts).
  const hasShrink = !!(spacingShrunk || itemFontSizeShrunk || itemFontWeightShrunk)

  return (
    <>
      {menuFontHref && <link rel="stylesheet" href={menuFontHref} precedence="default" />}
      {scaleCss && <style>{scaleCss}</style>}
      {anyToggle && (
        // Base (non-breakpoint) display only. The breakpoint @media rules are
        // emitted by buildTokenStyles so they track the site's breakpoint settings.
        // The dropdown trigger's base display:none lives inline on the element.
        <style>{`.cactus-nav-menu{display:flex}.cactus-nav-toggle{display:none}`}</style>
      )}
      {hasShrink && (
        <style>{[
          spacingShrunk ? `header[data-shrink-root][data-shrunk] .cactus-nav-list{gap:${hGapMap[spacingShrunk] ?? '0'} !important;}` : '',
          itemFontSizeShrunk ? `header[data-shrink-root][data-shrunk] .cactus-nav-link{font-size:${fontSizeMap[itemFontSizeShrunk]} !important;}` : '',
          itemFontWeightShrunk ? `header[data-shrink-root][data-shrunk] .cactus-nav-link{font-weight:${fontWeightMap[itemFontWeightShrunk]} !important;}` : '',
        ].filter(Boolean).join('\n')}</style>
      )}

      {menuMediaCss && <style>{menuMediaCss}</style>}
      {fitCss && <style>{fitCss}</style>}
      <ul
        ref={listRef}
        data-menu-id={blockId}
        {...(shrunkToFit ? { 'data-menu-fit': '' } : {})}
        className={['cactus-nav-list', anyToggle ? menuClasses : '', scaleClass].filter(Boolean).join(' ')}
        style={{
          display: anyToggle ? undefined : 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: shrunkToFit ? 'flex-start' : alignBase,
          listStyle: 'none',
          margin: 0,
          padding: 0,
          ...(hGap ? { gap: hGap } : {}),
          ...(fitEnabled ? {
            // nowrap is what makes scrollWidth mean "one line's worth"; minWidth 0
            // lets the list shrink to the room it's given when it's a flex item,
            // which is what clientWidth is then reporting.
            flexWrap: 'nowrap' as const,
            minWidth: 0,
            ...(shrunkToFit ? { transform: `scale(${fitScale})`, transformOrigin: 'left center' } : {}),
          } : {}),
        }}
      >
        {resolvedItems.map((item) => (
          <DesktopNavItem key={item.id} item={item} overrides={hasOverrides ? overrides : undefined} colours={colours} fontFamily={itemFontFamily || undefined} openOn={showDropdowns} />
        ))}
      </ul>

      {showHamburger && (
        <button
          className={[toggleBtnClasses, scaleClass].filter(Boolean).join(' ')}
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((o) => !o)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0.5rem',
            flexDirection: 'column',
            justifyContent: 'center',
            // The button stacks its three bars, so alignItems is its horizontal
            // axis. 'flex-start' is what the bars already do under the default
            // `stretch` (they carry an explicit 22px width, so there is nothing
            // to stretch), which keeps Left rendering exactly as it did.
            alignItems: FLEX_PLACE[dropAlign],
            gap: '5px',
            ...dropAlignMargins(dropAlign),
          }}
        >
          <span style={{ display: 'block', width: 22, height: 2, background: 'var(--color-text)', borderRadius: 2 }} />
          <span style={{ display: 'block', width: 22, height: 2, background: 'var(--color-text)', borderRadius: 2 }} />
          <span style={{ display: 'block', width: 22, height: 2, background: 'var(--color-text)', borderRadius: 2 }} />
        </button>
      )}

      {showDropdownNav && (
        <NavDropdown
          items={resolvedItems}
          colours={colours}
          fontFamily={itemFontFamily || undefined}
          className={[dropdownNavClasses, scaleClass].filter(Boolean).join(' ')}
          fallbackLabel="Menu"
          panelAlign={dropAlign}
        />
      )}

      {/* The hamburger's drawer spans the header's full width, so it takes the
          alignment as the row's text alignment rather than as a box position -
          and it stays out of the scale class: zooming a panel pinned to both
          edges would halve its width instead of shrinking what's in it. */}
      {showHamburger && mobileOpen && (
        <div style={{
          position: 'absolute',
          top: 64,
          left: 0,
          right: 0,
          borderTop: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
          paddingTop: '0.5rem',
          paddingBottom: '1rem',
        }}>
          {resolvedItems.map((item) => (
            <MobileNavItem
              key={item.id}
              item={item}
              onClose={() => setMobileOpen(false)}
              colours={colours}
              fontFamily={itemFontFamily || undefined}
              align={dropAlign}
            />
          ))}
        </div>
      )}
    </>
  )
}
