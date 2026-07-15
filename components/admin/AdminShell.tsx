'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import AdminNav from './AdminNav'
import CommandPalette from './CommandPalette'
import NotificationBell from './NotificationBell'
import { ThemeToggle } from '@/components/ThemeToggle'
import { AdminPathProvider } from './AdminPathContext'
import { isPuckEditorRoute } from '@/lib/puck/editor-routes'
import type { ResolvedNavSection } from '@/lib/nav/admin-menu'

type Props = {
  adminPath: string
  siteName: string
  version: string
  children: React.ReactNode
  sections: ResolvedNavSection[]
  unreadCount?: number
  faviconUrl?: string | null
  faviconDarkUrl?: string | null
}

export default function AdminShell({ adminPath, siteName, version, children, sections, unreadCount, faviconUrl, faviconDarkUrl }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  const pathname = usePathname()
  // Track whether the sidebar was auto-collapsed by the editor so we can restore it on exit
  const autoCollapsedRef = useRef(false)

  // Read the saved preference after mount, not during the initial render — reading
  // localStorage synchronously in a useState initializer makes the client's first
  // render diverge from the server-rendered HTML and trips a hydration error.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- must read after mount, not in the initializer, or the client's first render diverges from server HTML
    setCollapsed(localStorage.getItem('cactus-sidebar-collapsed') === 'true')
  }, [])

  // The rail-collapse preference is a desktop-only concept; the mobile drawer
  // is a full-width overlay so it must never inherit the collapsed rail state.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const update = () => setIsMobileViewport(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  const effectiveCollapsed = collapsed && !isMobileViewport

  // Auto-collapse when entering a Puck editor to maximise canvas space; auto-expand when leaving
  useEffect(() => {
    const inEditor = isPuckEditorRoute(pathname)
    if (inEditor && !autoCollapsedRef.current) {
      autoCollapsedRef.current = true
      setCollapsed(true)
      localStorage.setItem('cactus-sidebar-collapsed', 'true')
    } else if (!inEditor && autoCollapsedRef.current) {
      autoCollapsedRef.current = false
      setCollapsed(false)
      localStorage.setItem('cactus-sidebar-collapsed', 'false')
    }
  }, [pathname])

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('cactus-sidebar-collapsed', String(next))
    // Manual toggle clears auto-collapse tracking
    autoCollapsedRef.current = false
  }

  return (
    <AdminPathProvider value={adminPath}>
    <div className="admin-shell">
      {/* Mobile topbar — only visible on small screens */}
      <div className="admin-mobile-topbar">
        <button
          className="admin-burger"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
        >
          <span />
          <span />
          <span />
        </button>
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="admin-mobile-title"
          title={`Open ${siteName} in a new tab`}
        >
          {siteName}
        </a>
      </div>

      {/* Backdrop */}
      {mobileOpen && (
        <div
          className="admin-mobile-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside className={[
        'admin-sidebar',
        mobileOpen        ? 'admin-sidebar--open'      : '',
        effectiveCollapsed ? 'admin-sidebar--collapsed'  : '',
      ].filter(Boolean).join(' ')}>
        <div className="admin-sidebar-sticky-top">
          <div className="admin-sidebar-header">
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="admin-sidebar-logo-link"
              title={`Open ${siteName} in a new tab`}
            >
              {faviconUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={faviconUrl}
                    alt={siteName}
                    className="admin-sidebar-logo-img"
                    data-logo-variant={faviconDarkUrl ? 'light' : undefined}
                  />
                  {faviconDarkUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={faviconDarkUrl}
                      alt={siteName}
                      className="admin-sidebar-logo-img"
                      data-logo-variant="dark"
                    />
                  )}
                </>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src="/cactus.svg"
                  alt="Cactus Foundation"
                  className="admin-sidebar-logo-img"
                />
              )}
              {!effectiveCollapsed && <span className="admin-sidebar-logo-text">{siteName}</span>}
            </a>
            <button
              className="admin-sidebar-close"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
            >
              ×
            </button>
          </div>

          {/* Utility row: collapse toggle, theme switcher, notifications - grouped so
              the header reads as one control cluster instead of scattered rows. */}
          <div className={`admin-sidebar-toolbar${effectiveCollapsed ? ' admin-sidebar-toolbar--collapsed' : ''}`}>
            <button
              className="admin-sidebar-toggle"
              onClick={toggleCollapsed}
              title={effectiveCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={effectiveCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <span className="admin-sidebar-toggle-icon">{effectiveCollapsed ? '›' : '‹'}</span>
            </button>
            <button
              className="admin-sidebar-toggle admin-sidebar-search"
              onClick={() => window.dispatchEvent(new Event('cactus:open-command-palette'))}
              title="Search the menu (⌘K / Ctrl+K)"
              aria-label="Search the menu"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
            </button>
            <ThemeToggle compact collapsed={effectiveCollapsed} />
            <NotificationBell adminPath={adminPath} unreadCount={unreadCount} collapsed={effectiveCollapsed} />
          </div>
        </div>

        <div className="admin-sidebar-nav-scroll">
          <AdminNav
            adminPath={adminPath}
            version={version}
            sections={sections}
            collapsed={effectiveCollapsed}
            onNavClick={() => setMobileOpen(false)}
          />
        </div>
      </aside>

      <div className="admin-main">
        <div className={`admin-content${isPuckEditorRoute(pathname) ? ' admin-content--puck' : ''}`}>
          {children}
        </div>
      </div>
      <CommandPalette adminPath={adminPath} sections={sections} />
    </div>
    </AdminPathProvider>
  )
}
