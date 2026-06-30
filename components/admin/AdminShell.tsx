'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import AdminNav from './AdminNav'
import NotificationBell from './NotificationBell'
import { ThemeToggle } from '@/components/ThemeToggle'
import PendingDeployBanner from './PendingDeployBanner'
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
  unreadCount?: number
  pendingDeployId?: string
}

// Auto-collapse when a puck editor page is open to maximise canvas space
const PUCK_EDITOR_RE = /\/pages\/[^/]+$|\/appearance\/(header|footer)$|\/layouts\/[^/]+$/

export default function AdminShell({ adminPath, userRole, siteName, version, children, moduleNavEntries, unreadCount, pendingDeployId }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem('cactus-sidebar-collapsed') === 'true'
  )
  const pathname = usePathname()
  // Track whether the sidebar was auto-collapsed by the editor so we can restore it on exit
  const autoCollapsedRef = useRef(false)

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
            alt="Cactus Foundation"
            className="admin-sidebar-logo-img"
          />
          {!collapsed && <span className="admin-sidebar-logo-text">{siteName}</span>}
          {!collapsed && (
            <NotificationBell adminPath={adminPath} unreadCount={unreadCount} />
          )}
          <button
            className="admin-sidebar-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            ×
          </button>
        </div>

        {collapsed && (
          <div className="admin-sidebar-bell-row">
            <NotificationBell adminPath={adminPath} unreadCount={unreadCount} collapsed />
          </div>
        )}

        {/* Theme toggle — sits beneath the logo and notification bell, centred */}
        <div className={`admin-sidebar-theme${collapsed ? ' admin-sidebar-theme--collapsed' : ''}`}>
          <ThemeToggle compact collapsed={collapsed} />
        </div>

        {/* Desktop collapse/expand toggle — sits above the nav as a header control */}
        <button
          className="admin-sidebar-toggle"
          onClick={toggleCollapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span className="admin-sidebar-toggle-icon">{collapsed ? '›' : '‹'}</span>
          {!collapsed && <span className="admin-sidebar-toggle-label">Collapse</span>}
        </button>

        <AdminNav
          adminPath={adminPath}
          userRole={userRole}
          version={version}
          collapsed={collapsed}
          onNavClick={() => setMobileOpen(false)}
          moduleNavEntries={moduleNavEntries}
        />
      </aside>

      <div className="admin-main">
        {pendingDeployId && <PendingDeployBanner notificationId={pendingDeployId} adminPath={adminPath} />}
        <div className={`admin-content${PUCK_EDITOR_RE.test(pathname) ? ' admin-content--puck' : ''}`}>
          {children}
        </div>
      </div>
    </div>
    </AdminPathProvider>
  )
}
