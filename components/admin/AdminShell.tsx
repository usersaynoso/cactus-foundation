'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import AdminNav from './AdminNav'
import { AdminPathProvider } from './AdminPathContext'
import type { Role } from '@prisma/client'

type ModuleNavEntry = {
  label: string
  path: string
  icon?: string
}

type Props = {
  adminPath: string
  userRole: Role
  siteName: string
  version: string
  children: React.ReactNode
  moduleNavEntries?: ModuleNavEntry[]
}

// Auto-collapse when a puck editor page is open to maximise canvas space
const PUCK_EDITOR_RE = /\/pages\/[^/]+$|\/appearance\/(header|footer)$|\/layouts\/[^/]+$/

export default function AdminShell({ adminPath, userRole, siteName, version, children, moduleNavEntries }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  // Track whether the sidebar was auto-collapsed by the editor so we can restore it on exit
  const autoCollapsedRef = useRef(false)

  // Read persisted preference on mount
  useEffect(() => {
    const stored = localStorage.getItem('cactus-sidebar-collapsed')
    if (stored !== null) setCollapsed(stored === 'true')
  }, [])

  // Auto-collapse when entering puck editor; auto-expand when leaving
  useEffect(() => {
    const inEditor = PUCK_EDITOR_RE.test(pathname)
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
        <span className="admin-mobile-title">{siteName}</span>
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
        mobileOpen   ? 'admin-sidebar--open'      : '',
        collapsed    ? 'admin-sidebar--collapsed'  : '',
      ].filter(Boolean).join(' ')}>
        <div className="admin-sidebar-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/cactus.svg"
            alt="Cactus"
            className="admin-sidebar-logo-img"
          />
          {!collapsed && <span className="admin-sidebar-logo-text">{siteName}</span>}
          <button
            className="admin-sidebar-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            ×
          </button>
        </div>

        <AdminNav
          adminPath={adminPath}
          userRole={userRole}
          version={version}
          collapsed={collapsed}
          onNavClick={() => setMobileOpen(false)}
          moduleNavEntries={moduleNavEntries}
        />

        {/* Desktop collapse/expand toggle — pinned to the bottom of the sidebar */}
        <button
          className="admin-sidebar-toggle"
          onClick={toggleCollapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span className="admin-sidebar-toggle-icon">{collapsed ? '›' : '‹'}</span>
          {!collapsed && <span className="admin-sidebar-toggle-label">Collapse</span>}
        </button>
      </aside>

      <div className="admin-main">
        <div className={`admin-content${PUCK_EDITOR_RE.test(pathname) ? ' admin-content--puck' : ''}`}>
          {children}
        </div>
      </div>
    </div>
    </AdminPathProvider>
  )
}
