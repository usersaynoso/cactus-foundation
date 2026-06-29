'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Role } from '@prisma/client'
import { ThemeToggle } from '@/components/ThemeToggle'

type Props = {
  adminPath: string
  userRole: Role
  version: string
  collapsed?: boolean
  onNavClick?: () => void
}

export default function AdminNav({ adminPath, userRole, version, collapsed, onNavClick }: Props) {
  const pathname = usePathname()
  const base = `/${adminPath}`

  const links = [
    { href: `${base}`,            label: 'Dashboard',    icon: '◈' },
    { href: `${base}/pages`,      label: 'Pages',        icon: '📄' },
    { href: `${base}/menus`,      label: 'Menus',        icon: '☰' },
    { href: `${base}/media`,      label: 'Media',        icon: '🖼' },
    { href: `${base}/appearance`, label: 'Style Guide',  icon: '🎨' },
    { href: `${base}/layouts`,    label: 'Theme Builder', icon: '📐' },
    { href: `${base}/users`,      label: 'Users',        icon: '👥' },
    { href: `${base}/roles`,      label: 'Roles',        icon: '🔑' },
    { href: `${base}/modules`,    label: 'Modules',      icon: '🧩' },
    { href: `${base}/config`,     label: 'Settings',     icon: '⚙️' },
  ]

  return (
    <nav>
      {links.map((link) => {
        const isActive = pathname === link.href || (link.href !== base && pathname.startsWith(link.href))
        return (
          <Link
            key={link.href}
            href={link.href}
            className={isActive ? 'active' : ''}
            title={collapsed ? link.label : undefined}
            onClick={onNavClick}
          >
            <span style={{ width: 18, textAlign: 'center', flexShrink: 0 }}>{link.icon}</span>
            {!collapsed && <span className="admin-nav-label">{link.label}</span>}
          </Link>
        )
      })}

      <div className="admin-nav-footer">
        {!collapsed && (
          <div className="admin-nav-theme">
            <ThemeToggle compact />
          </div>
        )}
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
