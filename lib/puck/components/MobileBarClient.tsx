'use client'

import React, { useEffect, useId, useState } from 'react'
import { usePathname } from 'next/navigation'
import { mobileBarIcon } from '@/lib/puck/components/MobileBarIcons'
import { mobileBarCss, type MobileBarMenuItem, type MobileBarStyleProps } from '@/lib/puck/mobileBar'

// The Mobile Bar's one client island. It draws every cell core owns (a link, a
// menu, the account link) and leaves a hole for every cell a MODULE owns: those
// arrive already rendered, as React nodes on `slots`, because only the module
// knows what its own button counts, watches or opens.
//
// Why a client component at all, when most of the bar is links: the current page
// has to light up, and the menu panel has to open. Both are per-visitor, and
// neither is worth a round trip.

export type MobileBarRenderItem = {
  /** Stable within one bar - Puck's array index is not, once a row is dragged. */
  key: string
  kind: 'link' | 'menu' | 'account' | 'module'
  label: string
  icon?: string
  href?: string
  newTab?: boolean
  menuItems?: MobileBarMenuItem[]
  sheetHeading?: string
  /** kind 'module' with nothing rendered for it (module not installed) drops out. */
  hasSlot?: boolean
}

type Props = MobileBarStyleProps & {
  barId: string
  ariaLabel?: string
  items: MobileBarRenderItem[]
  /** item key -> the module's own button, rendered upstream by the RSC half. */
  slots?: Record<string, React.ReactNode>
  /** Editor canvas: the bar always paints, whatever breakpoints it is set to
   *  show on, or the owner would have to guess where it went. */
  forceVisible?: boolean
}

const CLOSE_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
)

const CHEVRON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m9 6 6 6-6 6" />
  </svg>
)

/** Trailing slashes and query strings must not stop the current page lighting
 *  up, and "/" must not match every page on the site. */
function isCurrent(pathname: string | null, href: string | undefined): boolean {
  if (!pathname || !href) return false
  const target = (href.split('?')[0] ?? '').split('#')[0]?.replace(/\/+$/, '') ?? ''
  const here = pathname.replace(/\/+$/, '')
  if (target === '') return here === ''
  return here === target || here.startsWith(`${target}/`)
}

function SheetMenuItem({ item, depth, onNavigate }: { item: MobileBarMenuItem; depth: number; onNavigate: () => void }) {
  const [open, setOpen] = useState(false)
  const hasChildren = (item.children?.length ?? 0) > 0
  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem',
    padding: `0.625rem ${0.75 + depth * 0.75}rem`,
    color: 'var(--color-text)', textDecoration: 'none', fontSize: '0.9375rem',
  }
  return (
    <li>
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        {item.href
          ? (
            <a
              href={item.href}
              target={item.openInNewTab ? '_blank' : undefined}
              rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
              style={{ ...rowStyle, flex: 1 }}
              onClick={onNavigate}
            >
              {item.label}
            </a>
          )
          : <span style={{ ...rowStyle, flex: 1, color: 'var(--color-text-muted, #6b7280)' }}>{item.label}</span>}
        {hasChildren && (
          <button
            type="button"
            aria-expanded={open}
            aria-label={open ? `Collapse ${item.label}` : `Expand ${item.label}`}
            onClick={() => setOpen((v) => !v)}
            style={{
              background: 'none', border: 0, padding: '0 0.9rem', cursor: 'pointer', lineHeight: 0,
              color: 'var(--color-text-muted, #6b7280)',
              transform: open ? 'rotate(90deg)' : undefined,
            }}
          >
            {CHEVRON}
          </button>
        )}
      </div>
      {hasChildren && open && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {item.children!.map((child) => (
            <SheetMenuItem key={child.id} item={child} depth={depth + 1} onNavigate={onNavigate} />
          ))}
        </ul>
      )}
    </li>
  )
}

export default function MobileBarClient({ barId, ariaLabel, items, slots, forceVisible, ...style }: Props) {
  const pathname = usePathname()
  const reactId = useId()
  // Which menu cell has its panel up, by item key. One at a time: two panels
  // stacked on a phone is nobody's idea of navigation.
  const [openKey, setOpenKey] = useState<string | null>(null)
  // A navigation away from the page closes the panel: one left open across a
  // route change looks like the site has hung. Adjusted during render rather
  // than in an effect - React's own advice for state that derives from a prop,
  // and it avoids the extra paint an effect would cost on every navigation.
  const [openedAt, setOpenedAt] = useState(pathname)
  if (openedAt !== pathname) {
    setOpenedAt(pathname)
    setOpenKey(null)
  }

  const css = mobileBarCss(barId, forceVisible ? { ...style, barOn: 'all' } : style)

  const close = () => setOpenKey(null)

  // Escape closes it too.
  useEffect(() => {
    if (!openKey) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenKey(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openKey])

  const visible = items.filter((item) => item.kind !== 'module' || item.hasSlot)
  if (visible.length === 0) return null

  const showLabels = (style.showLabels ?? 'yes') === 'yes'
  const openItem = visible.find((i) => i.key === openKey) ?? null

  return (
    <nav data-cmb-id={barId} aria-label={ariaLabel || 'Quick links'}>
      <style>{css}</style>
      <ul className="cmb-list">
        {visible.map((item) => {
          const label = (item.label ?? '').trim()
          const icon = mobileBarIcon(item.icon)
          if (item.kind === 'module') {
            return <li key={item.key} className="cmb-cell">{slots?.[item.key]}</li>
          }
          if (item.kind === 'menu') {
            const isOpen = openKey === item.key
            return (
              <li key={item.key} className="cmb-cell">
                <button
                  type="button"
                  className="cmb-item"
                  aria-expanded={isOpen}
                  aria-controls={`${reactId}-sheet`}
                  data-cmb-active={isOpen ? 'true' : undefined}
                  onClick={() => setOpenKey(isOpen ? null : item.key)}
                >
                  <span className="cmb-icon">{icon}</span>
                  {showLabels && label && <span className="cmb-label">{label}</span>}
                </button>
              </li>
            )
          }
          return (
            <li key={item.key} className="cmb-cell">
              <a
                className="cmb-item"
                href={item.href || '#'}
                target={item.newTab ? '_blank' : undefined}
                rel={item.newTab ? 'noopener noreferrer' : undefined}
                data-cmb-active={isCurrent(pathname, item.href) ? 'true' : undefined}
                aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}
              >
                <span className="cmb-icon">{icon}</span>
                {showLabels && label && <span className="cmb-label">{label}</span>}
              </a>
            </li>
          )
        })}
      </ul>

      {/* One panel, reused by whichever menu cell is up. Rendered even when shut
          so it can slide rather than appear, which is the whole point of it. */}
      <button
        type="button"
        className="cmb-scrim"
        aria-label="Close menu"
        inert={!openItem}
        data-cmb-open={openItem ? 'true' : undefined}
        onClick={close}
      />
      <div
        id={`${reactId}-sheet`}
        className="cmb-sheet"
        role="dialog"
        aria-modal="false"
        aria-label={openItem?.sheetHeading || openItem?.label || 'Menu'}
        inert={!openItem}
        data-cmb-open={openItem ? 'true' : undefined}
      >
        <div className="cmb-sheet-head">
          <p className="cmb-sheet-title">{openItem?.sheetHeading || openItem?.label || 'Menu'}</p>
          <button type="button" className="cmb-sheet-close" aria-label="Close menu" onClick={close}>{CLOSE_ICON}</button>
        </div>
        <div className="cmb-sheet-body">
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {(openItem?.menuItems ?? []).map((mi) => (
              <SheetMenuItem key={mi.id} item={mi} depth={0} onNavigate={close} />
            ))}
          </ul>
        </div>
      </div>
    </nav>
  )
}
