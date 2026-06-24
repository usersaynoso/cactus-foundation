'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { PublicMenuItem } from '@/lib/menu/resolve'

type Props = {
  siteName: string
  mainMenu?: PublicMenuItem[]
}

export default function Nav({ siteName, mainMenu = [] }: Props) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  function handleItemClick(item: PublicMenuItem) {
    if (item.children && item.children.length > 0) {
      setOpenId(openId === item.id ? null : item.id)
    } else {
      setOpenId(null)
      setMobileOpen(false)
    }
  }

  return (
    <header className="prickly-header">
      <nav className="prickly-nav">
        <Link href="/" className="prickly-logo">
          🌵 {siteName}
        </Link>

        {/* Desktop menu */}
        {mainMenu.length > 0 && (
          <ul className="prickly-menu" onMouseLeave={() => setOpenId(null)}>
            {mainMenu.map((item) => {
              const hasChildren = item.children && item.children.length > 0
              return (
                <li
                  key={item.id}
                  className={`prickly-menu-item${hasChildren ? ' prickly-has-dropdown' : ''}`}
                  onMouseEnter={() => hasChildren && setOpenId(item.id)}
                >
                  <Link
                    href={item.href}
                    target={item.openInNewTab ? '_blank' : undefined}
                    rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
                    className="prickly-menu-link"
                    onClick={() => !hasChildren && setOpenId(null)}
                  >
                    {item.label}
                    {hasChildren && <span className="prickly-dropdown-arrow" aria-hidden>▾</span>}
                  </Link>
                  {hasChildren && (
                    <ul
                      className="prickly-dropdown"
                      style={{ display: openId === item.id ? 'block' : 'none' }}
                    >
                      {item.children!.map((child) => (
                        <li key={child.id}>
                          <Link
                            href={child.href}
                            target={child.openInNewTab ? '_blank' : undefined}
                            rel={child.openInNewTab ? 'noopener noreferrer' : undefined}
                            className="prickly-dropdown-link"
                            onClick={() => setOpenId(null)}
                          >
                            {child.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {/* Mobile hamburger */}
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

      {/* Mobile drawer */}
      {mobileOpen && mainMenu.length > 0 && (
        <div className="prickly-mobile-menu">
          {mainMenu.map((item) => {
            const hasChildren = item.children && item.children.length > 0
            return (
              <div key={item.id}>
                <div
                  className={`prickly-mobile-item${hasChildren ? ' prickly-mobile-parent' : ''}`}
                  onClick={() => handleItemClick(item)}
                >
                  {hasChildren ? (
                    <span className="prickly-mobile-link">{item.label} {openId === item.id ? '▴' : '▾'}</span>
                  ) : (
                    <Link
                      href={item.href}
                      target={item.openInNewTab ? '_blank' : undefined}
                      rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
                      className="prickly-mobile-link"
                      onClick={() => setMobileOpen(false)}
                    >
                      {item.label}
                    </Link>
                  )}
                </div>
                {hasChildren && openId === item.id && (
                  <div className="prickly-mobile-children">
                    {item.children!.map((child) => (
                      <Link
                        key={child.id}
                        href={child.href}
                        target={child.openInNewTab ? '_blank' : undefined}
                        rel={child.openInNewTab ? 'noopener noreferrer' : undefined}
                        className="prickly-mobile-child-link"
                        onClick={() => { setOpenId(null); setMobileOpen(false) }}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </header>
  )
}
