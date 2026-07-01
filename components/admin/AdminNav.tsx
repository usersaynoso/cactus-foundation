'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Role } from '@prisma/client'

type ModuleNavEntry = {
  label: string
  path: string
  icon?: string
}

type Props = {
  adminPath: string
  userRole: Role
  version: string
  collapsed?: boolean
  onNavClick?: () => void
  moduleNavEntries?: ModuleNavEntry[]
}

const CORE_LINKS = [
  { path: '',            label: 'Dashboard', icon: '◈' },
  { path: '/pages',      label: 'Pages',     icon: '📄' },
  { path: '/menus',      label: 'Menus',     icon: '☰' },
  { path: '/media',      label: 'Media',     icon: '🖼' },
  { path: '/appearance', label: 'Styles',    icon: '🎨' },
  { path: '/layouts',    label: 'Layouts',   icon: '📐' },
  { path: '/users',      label: 'Users',     icon: '👥' },
  { path: '/roles',      label: 'Roles',     icon: '🔑' },
  { path: '/modules',    label: 'Modules',   icon: '🧩' },
  { path: '/config',     label: 'Settings',  icon: '⚙️' },
]

export default function AdminNav({ adminPath, version, collapsed, onNavClick, moduleNavEntries }: Props) {
  const pathname = usePathname()
  const base = `/${adminPath}`

  function isActive(href: string) {
    return pathname === href || (href !== base && pathname.startsWith(href))
  }

  return (
    <nav>
      {CORE_LINKS.map((link) => {
        const href = `${base}${link.path}`
        return (
          <Link
            key={href}
            href={href}
            className={isActive(href) ? 'active' : ''}
            title={collapsed ? link.label : undefined}
            onClick={onNavClick}
          >
            <span className="admin-nav-icon">{link.icon}</span>
            {!collapsed && link.label}
          </Link>
        )
      })}

      {moduleNavEntries && moduleNavEntries.length > 0 && (
        <>
          {!collapsed && <div className="admin-nav-section-label">Modules</div>}
          {moduleNavEntries.map((entry) => {
            const href = `${base}${entry.path}`
            return (
              <Link
                key={href}
                href={href}
                className={isActive(href) ? 'active' : ''}
                title={collapsed ? entry.label : undefined}
                onClick={onNavClick}
              >
                <span className="admin-nav-icon">{entry.icon ?? '🧩'}</span>
                {!collapsed && entry.label}
              </Link>
            )
          })}
        </>
      )}

      <div className="admin-nav-footer">
        <Link
          href={`${base}/account`}
          className={`admin-nav-account${collapsed ? ' admin-nav-account--collapsed' : ''}`}
          title={collapsed ? 'My Account' : undefined}
          onClick={onNavClick}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M20 21a8 8 0 1 0-16 0" /></svg>
          {!collapsed && <span>My Account</span>}
        </Link>
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className={`admin-nav-logout${collapsed ? ' admin-nav-logout--collapsed' : ''}`}
            title={collapsed ? 'Sign out' : undefined}
          >
            <span>⏻</span>
            {!collapsed && <span>Sign out</span>}
          </button>
        </form>
        {!collapsed && (
          <p className="admin-nav-version">v{version}</p>
        )}
      </div>
    </nav>
  )
}
