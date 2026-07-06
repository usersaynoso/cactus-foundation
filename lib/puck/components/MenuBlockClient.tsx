'use client'
import { useState } from 'react'

type MenuItem = {
  id: string
  label: string
  href: string
  openInNewTab: boolean
  children?: MenuItem[]
}

const DROPDOWN_PANEL: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  left: 0,
  minWidth: 180,
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

function DropdownLink({ item, hasChildren }: { item: MenuItem; hasChildren: boolean }) {
  const [hovered, setHovered] = useState(false)
  return (
    <a
      href={item.href}
      target={item.openInNewTab ? '_blank' : undefined}
      rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
      style={{
        display: hasChildren ? 'flex' : 'block',
        justifyContent: hasChildren ? 'space-between' : undefined,
        alignItems: hasChildren ? 'center' : undefined,
        padding: '0.5rem 1rem',
        fontSize: '0.9rem',
        color: hovered ? 'var(--color-primary)' : 'var(--color-text)',
        background: hovered ? 'var(--color-primary-subtle)' : 'transparent',
        textDecoration: 'none',
        transition: 'color 0.15s, background 0.15s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {item.label}
      {hasChildren && (
        <span style={{ opacity: 0.5, fontSize: '0.7rem', marginLeft: '0.5rem' }} aria-hidden>▸</span>
      )}
    </a>
  )
}

function DesktopNavItem({ item, overrides, depth = 0 }: {
  item: MenuItem
  overrides?: React.CSSProperties
  depth?: number
}) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const hasChildren = !!item.children?.length

  if (depth === 0) {
    return (
      <li
        style={{ position: 'relative' }}
        onMouseEnter={() => hasChildren && setOpen(true)}
        onMouseLeave={() => { setOpen(false); setHovered(false) }}
      >
        <a
          href={item.href}
          target={item.openInNewTab ? '_blank' : undefined}
          rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0.5rem 0.875rem',
            fontSize: overrides?.fontSize ?? '0.9375rem',
            fontWeight: overrides?.fontWeight ?? 500,
            textTransform: overrides?.textTransform,
            color: hovered ? 'var(--color-primary)' : (overrides?.color ?? 'var(--color-text)'),
            background: hovered ? 'var(--color-primary-subtle)' : 'transparent',
            textDecoration: 'none',
            borderRadius: 6,
            transition: 'color 0.15s, background 0.15s',
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onClick={() => setOpen(false)}
        >
          {item.label}
          {hasChildren && (
            <span style={{ fontSize: '0.625rem', opacity: 0.6 }} aria-hidden>▾</span>
          )}
        </a>
        {hasChildren && open && (
          <ul style={DROPDOWN_PANEL}>
            {item.children!.map((child) => (
              <DesktopNavItem key={child.id} item={child} depth={1} />
            ))}
          </ul>
        )}
      </li>
    )
  }

  return (
    <li
      style={{ position: 'relative' }}
      onMouseEnter={() => hasChildren && setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <DropdownLink item={item} hasChildren={hasChildren} />
      {hasChildren && open && (
        <ul style={SUBDROPDOWN_PANEL}>
          {item.children!.map((child) => (
            <DesktopNavItem key={child.id} item={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

function MobileNavItem({ item, onClose, depth = 0 }: {
  item: MenuItem
  onClose: () => void
  depth?: number
}) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const hasChildren = !!item.children?.length
  const pl = depth > 0 ? `${depth + 1}rem` : '1.5rem'

  return (
    <div>
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
            color: 'var(--color-text)',
            borderBottom: '1px solid var(--color-border)',
          }}>
            {item.label} {open ? '▴' : '▾'}
          </span>
        ) : (
          <a
            href={item.href}
            target={item.openInNewTab ? '_blank' : undefined}
            rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
            style={{
              display: 'block',
              padding: '0.625rem 0',
              fontSize: '1rem',
              fontWeight: 500,
              color: hovered ? 'var(--color-primary)' : 'var(--color-text)',
              textDecoration: 'none',
              borderBottom: '1px solid var(--color-border)',
              transition: 'color 0.15s',
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={onClose}
          >
            {item.label}
          </a>
        )}
      </div>
      {hasChildren && open && (
        <div>
          {item.children!.map((child) => (
            <MobileNavItem key={child.id} item={child} onClose={onClose} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

const fontSizeMap: Record<string, string> = { small: '0.8125rem', medium: '0.9375rem', large: '1.0625rem' }
const fontWeightMap: Record<string, string | number> = { normal: 400, medium: 500, semibold: 600, bold: 700 }
const hGapMap: Record<string, string> = { tight: '0', normal: '0', wide: '0.5rem' }

type Props = {
  resolvedItems?: MenuItem[]
  spacing?: 'tight' | 'normal' | 'wide'
  itemFontSize?: 'small' | 'medium' | 'large'
  itemFontWeight?: 'normal' | 'medium' | 'semibold' | 'bold'
  textTransform?: string
  itemColor?: string
  showDesktopToggle?: string
  showMobileToggle?: string
  showTabletToggle?: string
  [key: string]: unknown
}

export default function MenuBlockClient({
  resolvedItems,
  spacing = 'normal',
  itemFontSize = 'medium',
  itemFontWeight = 'medium',
  textTransform = 'none',
  itemColor,
  showDesktopToggle = 'show',
  showMobileToggle = 'collapse',
  showTabletToggle = 'collapse',
}: Props) {
  const [mobileOpen, setMobileOpen] = useState(false)

  if (!resolvedItems) {
    return (
      <div style={{ padding: '0.75rem 1rem', background: 'var(--color-bg-subtle)', borderRadius: 6, color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
        Menu — configure in editor
      </div>
    )
  }

  const hGap = hGapMap[spacing] ?? '0'

  const overrides: React.CSSProperties = {}
  if (itemColor) overrides.color = itemColor
  if (itemFontSize !== 'medium') overrides.fontSize = fontSizeMap[itemFontSize]
  if (itemFontWeight !== 'medium') overrides.fontWeight = fontWeightMap[itemFontWeight]
  if (textTransform !== 'none') overrides.textTransform = textTransform as React.CSSProperties['textTransform']

  const hasOverrides = Object.keys(overrides).length > 0
  const collapseDesktop = showDesktopToggle !== 'show'
  const collapseMobile = showMobileToggle !== 'show'
  const collapseTablet = showTabletToggle !== 'show'
  const showHamburger = (collapseDesktop || collapseMobile || collapseTablet) && resolvedItems.length > 0
  const collapseModifiers = [collapseDesktop && 'cactus-nav-collapse-desktop', collapseMobile && 'cactus-nav-collapse-mobile', collapseTablet && 'cactus-nav-collapse-tablet'].filter(Boolean)
  const menuClasses = ['cactus-nav-menu', ...collapseModifiers].join(' ')
  const toggleBtnClasses = ['cactus-nav-toggle', ...collapseModifiers].join(' ')

  return (
    <>
      {showHamburger && (
        // Base (non-breakpoint) display only. The breakpoint @media rules are
        // emitted by buildTokenStyles so they track the site's breakpoint settings.
        <style>{`.cactus-nav-menu{display:flex}.cactus-nav-toggle{display:none}`}</style>
      )}

      <ul
        className={showHamburger ? menuClasses : undefined}
        style={{
          display: showHamburger ? undefined : 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          listStyle: 'none',
          margin: 0,
          padding: 0,
          ...(hGap ? { gap: hGap } : {}),
        }}
      >
        {resolvedItems.map((item) => (
          <DesktopNavItem key={item.id} item={item} overrides={hasOverrides ? overrides : undefined} />
        ))}
      </ul>

      {showHamburger && (
        <button
          className={toggleBtnClasses}
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
            gap: '5px',
          }}
        >
          <span style={{ display: 'block', width: 22, height: 2, background: 'var(--color-text)', borderRadius: 2 }} />
          <span style={{ display: 'block', width: 22, height: 2, background: 'var(--color-text)', borderRadius: 2 }} />
          <span style={{ display: 'block', width: 22, height: 2, background: 'var(--color-text)', borderRadius: 2 }} />
        </button>
      )}

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
            />
          ))}
        </div>
      )}
    </>
  )
}
