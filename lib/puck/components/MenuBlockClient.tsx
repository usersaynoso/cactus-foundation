'use client'
import { useState } from 'react'

type MenuItem = {
  id: string
  label: string
  href: string
  openInNewTab: boolean
  children?: MenuItem[]
}

function DesktopNavItem({ item, linkStyle, depth = 0 }: {
  item: MenuItem
  linkStyle?: React.CSSProperties
  depth?: number
}) {
  const [open, setOpen] = useState(false)
  const hasChildren = !!item.children?.length

  if (depth === 0) {
    return (
      <li
        className={`prickly-menu-item${hasChildren ? ' prickly-has-dropdown' : ''}`}
        onMouseEnter={() => hasChildren && setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <a
          href={item.href}
          target={item.openInNewTab ? '_blank' : undefined}
          rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
          className="prickly-menu-link"
          style={linkStyle}
          onClick={() => setOpen(false)}
        >
          {item.label}
          {hasChildren && <span className="prickly-dropdown-arrow" aria-hidden>▾</span>}
        </a>
        {hasChildren && open && (
          <ul className="prickly-dropdown">
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
      <a
        href={item.href}
        target={item.openInNewTab ? '_blank' : undefined}
        rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
        className="prickly-dropdown-link"
        style={hasChildren ? { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } : undefined}
        onClick={() => setOpen(false)}
      >
        {item.label}
        {hasChildren && (
          <span style={{ opacity: 0.5, fontSize: '0.7rem', marginLeft: '0.5rem' }} aria-hidden>▸</span>
        )}
      </a>
      {hasChildren && open && (
        <ul className="prickly-subdropdown">
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
  const hasChildren = !!item.children?.length
  const indent = depth > 0 ? { paddingLeft: `${(depth + 1) * 1}rem` } : undefined

  return (
    <div>
      <div
        className={`prickly-mobile-item${hasChildren ? ' prickly-mobile-parent' : ''}`}
        style={indent}
        onClick={() => hasChildren && setOpen((o) => !o)}
      >
        {hasChildren ? (
          <span className="prickly-mobile-link">
            {item.label} {open ? '▴' : '▾'}
          </span>
        ) : (
          <a
            href={item.href}
            target={item.openInNewTab ? '_blank' : undefined}
            rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
            className="prickly-mobile-link"
            onClick={onClose}
          >
            {item.label}
          </a>
        )}
      </div>
      {hasChildren && open && (
        <div className="prickly-mobile-children">
          {item.children!.map((child) => (
            <MobileNavItem key={child.id} item={child} onClose={onClose} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

const horizontalGaps: Record<string, string> = { tight: '0', normal: '0', wide: '0.5rem' }
const fontSizeMap: Record<string, string> = { small: '0.8125rem', medium: '0.9375rem', large: '1.0625rem' }
const fontWeightMap: Record<string, string | number> = { normal: 400, medium: 500, semibold: 600, bold: 700 }

type Props = {
  resolvedItems?: MenuItem[]
  spacing?: 'tight' | 'normal' | 'wide'
  itemFontSize?: 'small' | 'medium' | 'large'
  itemFontWeight?: 'normal' | 'medium' | 'semibold' | 'bold'
  textTransform?: string
  itemColor?: string
  hoverBackground?: string
  showMobileToggle?: string
  [key: string]: unknown
}

export default function MenuBlockClient({
  resolvedItems,
  spacing = 'normal',
  itemFontSize = 'medium',
  itemFontWeight = 'medium',
  textTransform = 'none',
  itemColor,
  hoverBackground,
  showMobileToggle = 'collapse',
}: Props) {
  const [mobileOpen, setMobileOpen] = useState(false)

  if (!resolvedItems) {
    return (
      <div style={{ padding: '0.75rem 1rem', background: '#f3f4f6', borderRadius: 6, color: '#9ca3af', fontSize: '0.875rem' }}>
        Menu — configure in editor
      </div>
    )
  }

  const hGap = horizontalGaps[spacing] ?? '0'

  const linkStyleOverride: React.CSSProperties = {}
  if (itemColor) linkStyleOverride.color = itemColor
  if (itemFontSize !== 'medium') linkStyleOverride.fontSize = fontSizeMap[itemFontSize]
  if (itemFontWeight !== 'medium') linkStyleOverride.fontWeight = fontWeightMap[itemFontWeight]
  if (textTransform !== 'none') linkStyleOverride.textTransform = textTransform as React.CSSProperties['textTransform']
  if (hoverBackground) (linkStyleOverride as Record<string, unknown>)['--prickly-hover-bg'] = hoverBackground

  const linkStyle = Object.keys(linkStyleOverride).length > 0 ? linkStyleOverride : undefined
  const showHamburger = showMobileToggle !== 'show' && resolvedItems.length > 0

  return (
    <>
      <ul className="prickly-menu" style={hGap ? { gap: hGap } : undefined}>
        {resolvedItems.map((item) => (
          <DesktopNavItem key={item.id} item={item} linkStyle={linkStyle} />
        ))}
      </ul>

      {showHamburger && (
        <button
          className="prickly-mobile-toggle"
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((o) => !o)}
        >
          <span className="prickly-hamburger" />
        </button>
      )}

      {showHamburger && mobileOpen && (
        <div
          className="prickly-mobile-menu"
          style={{
            position: 'absolute',
            top: 'var(--prickly-header-height)',
            left: 0,
            right: 0,
          }}
        >
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
