'use client'

import type { ReactNode } from 'react'
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

const ICON_PROPS = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

const NAV_ICONS: Record<string, ReactNode> = {
  dashboard: (
    <svg {...ICON_PROPS}><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></svg>
  ),
  pages: (
    <svg {...ICON_PROPS}><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" /></svg>
  ),
  menus: (
    <svg {...ICON_PROPS}><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></svg>
  ),
  media: (
    <svg {...ICON_PROPS}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.75" /><path d="M3 17l5.5-5.5a1.5 1.5 0 0 1 2.12 0L18 19" /></svg>
  ),
  appearance: (
    <svg {...ICON_PROPS}><path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.55-.22-1.05-.59-1.41-.36-.37-.58-.87-.58-1.42 0-1.1.9-2 2-2H17a4 4 0 0 0 4-4c0-4.42-4.03-7.17-9-7.17Z" /><circle cx="7.5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="9.5" cy="7.5" r="1" fill="currentColor" stroke="none" /><circle cx="14.5" cy="7.5" r="1" fill="currentColor" stroke="none" /></svg>
  ),
  layouts: (
    <svg {...ICON_PROPS}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /><path d="M15 4v16" /></svg>
  ),
  users: (
    <svg {...ICON_PROPS}><circle cx="8.5" cy="8" r="3" /><path d="M2.5 20a6 6 0 0 1 12 0" /><path d="M15.5 6.5a3 3 0 0 1 0 5.8" /><path d="M21.5 20a5.5 5.5 0 0 0-5-5.47" /></svg>
  ),
  roles: (
    <svg {...ICON_PROPS}><circle cx="8" cy="15" r="4" /><path d="M11 12l8-8" /><path d="M16 7l2.5 2.5" /><path d="M19 4l2.5 2.5" /></svg>
  ),
  modules: (
    <svg {...ICON_PROPS}><path d="M9 3.5v3a1.5 1.5 0 0 0 3 0v-3H16a1 1 0 0 1 1 1V8a1.5 1.5 0 0 0 0 3v4a1 1 0 0 1-1 1h-3.5a1.5 1.5 0 0 0-3 0H6a1 1 0 0 1-1-1v-3.5a1.5 1.5 0 0 0 0-3V5a1 1 0 0 1 1-1z" /></svg>
  ),
  config: (
    <svg {...ICON_PROPS}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.36.36.86.58 1.51.7A2 2 0 0 1 21 12a2 2 0 0 1-1.6 1.96 1.65 1.65 0 0 0-1 1.04z" /></svg>
  ),
}

const NAV_SECTIONS: { label: string | null; links: { path: string; label: string; icon: string }[] }[] = [
  {
    label: null,
    links: [{ path: '', label: 'Dashboard', icon: 'dashboard' }],
  },
  {
    label: 'Content',
    links: [
      { path: '/pages',      label: 'Pages',   icon: 'pages' },
      { path: '/menus',      label: 'Menus',   icon: 'menus' },
      { path: '/media',      label: 'Media',   icon: 'media' },
      { path: '/appearance', label: 'Styles',  icon: 'appearance' },
      { path: '/layouts',    label: 'Layouts', icon: 'layouts' },
    ],
  },
  {
    label: 'People',
    links: [
      { path: '/users', label: 'Users', icon: 'users' },
      { path: '/roles', label: 'Roles', icon: 'roles' },
    ],
  },
  {
    label: 'System',
    links: [
      { path: '/modules', label: 'Modules',  icon: 'modules' },
      { path: '/config',  label: 'Settings', icon: 'config' },
    ],
  },
]

export default function AdminNav({ adminPath, version, collapsed, onNavClick, moduleNavEntries }: Props) {
  const pathname = usePathname()
  const base = `/${adminPath}`

  function isActive(href: string) {
    return pathname === href || (href !== base && pathname.startsWith(href))
  }

  return (
    <nav>
      {NAV_SECTIONS.map((section, sectionIndex) => (
        <div key={section.label ?? `section-${sectionIndex}`}>
          {sectionIndex > 0 && (collapsed ? <div className="admin-nav-divider" /> : null)}
          {!collapsed && section.label && <div className="admin-nav-section-label">{section.label}</div>}
          {section.links.map((link) => {
            const href = `${base}${link.path}`
            return (
              <Link
                key={href}
                href={href}
                className={isActive(href) ? 'active' : ''}
                title={collapsed ? link.label : undefined}
                onClick={onNavClick}
              >
                <span className="admin-nav-icon">{NAV_ICONS[link.icon]}</span>
                {!collapsed && link.label}
              </Link>
            )
          })}
        </div>
      ))}

      {moduleNavEntries && moduleNavEntries.length > 0 && (
        <>
          {collapsed ? <div className="admin-nav-divider" /> : <div className="admin-nav-section-label">Modules</div>}
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
