'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { PublicMenuItem } from '@/lib/menu/resolve'

type Props = {
  siteName: string
  mainMenu?: PublicMenuItem[]
}

function DesktopNavItem({ item, depth = 0 }: { item: PublicMenuItem; depth?: number }) {
  const [open, setOpen] = useState(false)
  const hasChildren = item.children && item.children.length > 0

  if (depth === 0) {
    return (
      <li
        className={`prickly-menu-item${hasChildren ? ' prickly-has-dropdown' : ''}`}
        onMouseEnter={() => hasChildren && setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <Link
          href={item.href}
          target={item.openInNewTab ? '_blank' : undefined}
          rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
          className="prickly-menu-link"
          onClick={() => setOpen(false)}
        >
          {item.label}
          {hasChildren && <span className="prickly-dropdown-arrow" aria-hidden>▾</span>}
        </Link>
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
      <Link
        href={item.href}
        target={item.openInNewTab ? '_blank' : undefined}
        rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
        className="prickly-dropdown-link"
        style={hasChildren ? { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } : undefined}
        onClick={() => setOpen(false)}
      >
        {item.label}
        {hasChildren && <span style={{ opacity: 0.5, fontSize: '0.7rem', marginLeft: '0.5rem' }} aria-hidden>▸</span>}
      </Link>
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

function MobileNavItem({ item, onClose, depth = 0 }: { item: PublicMenuItem; onClose: () => void; depth?: number }) {
  const [open, setOpen] = useState(false)
  const hasChildren = item.children && item.children.length > 0
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
          <Link
            href={item.href}
            target={item.openInNewTab ? '_blank' : undefined}
            rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
            className="prickly-mobile-link"
            onClick={onClose}
          >
            {item.label}
          </Link>
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

export default function Nav({ siteName, mainMenu = [] }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="prickly-header">
      <nav className="prickly-nav">
        <Link href="/" className="prickly-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cactus.svg" alt="Cactus" style={{ height: 28, width: 28, flexShrink: 0 }} />
          {siteName}
        </Link>

        {mainMenu.length > 0 && (
          <ul className="prickly-menu">
            {mainMenu.map((item) => (
              <DesktopNavItem key={item.id} item={item} />
            ))}
          </ul>
        )}

        {mainMenu.length > 0 && (
          <button
            className="prickly-mobile-toggle"
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((o) => !o)}
          >
            <span className="prickly-hamburger" />
          </button>
        )}
      </nav>

      {mobileOpen && mainMenu.length > 0 && (
        <div className="prickly-mobile-menu">
          {mainMenu.map((item) => (
            <MobileNavItem key={item.id} item={item} onClose={() => setMobileOpen(false)} />
          ))}
        </div>
      )}
    </header>
  )
}
