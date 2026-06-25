'use client'

import { useState } from 'react'
import AdminNav from './AdminNav'
import type { Role } from '@prisma/client'

type Props = {
  adminPath: string
  userRole: Role
  siteName: string
  version: string
  children: React.ReactNode
}

export default function AdminShell({ adminPath, userRole, siteName, version, children }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
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

      <aside className={`admin-sidebar${mobileOpen ? ' admin-sidebar--open' : ''}`}>
        <div className="admin-sidebar-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cactus.svg" alt="Cactus" style={{ width: 28, height: 28, background: '#fff', borderRadius: 4, padding: 2, flexShrink: 0 }} />
          {siteName}
          <button
            className="admin-sidebar-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            ×
          </button>
        </div>
        <AdminNav adminPath={adminPath} userRole={userRole} version={version} onNavClick={() => setMobileOpen(false)} />
      </aside>

      <div className="admin-main">
        <div className="admin-content">
          {children}
        </div>
      </div>
    </div>
  )
}
