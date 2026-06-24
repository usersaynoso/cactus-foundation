'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Role } from '@prisma/client'

type Props = {
  adminPath: string
  userRole: Role
  onNavClick?: () => void
}

export default function AdminNav({ adminPath, userRole, onNavClick }: Props) {
  const pathname = usePathname()
  const base = `/${adminPath}`

  const links = [
    { href: `${base}`, label: 'Dashboard', icon: '◈' },
    { href: `${base}/pages`, label: 'Pages', icon: '📄' },
    { href: `${base}/menus`, label: 'Menus', icon: '☰' },
    { href: `${base}/media`, label: 'Media', icon: '🖼' },
    { href: `${base}/users`, label: 'Users', icon: '👥' },
    { href: `${base}/roles`, label: 'Roles', icon: '🔑' },
    { href: `${base}/modules`, label: 'Modules', icon: '🧩' },
    { href: `${base}/themes`, label: 'Themes', icon: '🎨' },
    { href: `${base}/config`, label: 'Settings', icon: '⚙️' },
  ]

  return (
    <nav>
      {links.map((link) => {
        const isActive = pathname === link.href || (link.href !== base && pathname.startsWith(link.href))
        return (
          <Link key={link.href} href={link.href} className={isActive ? 'active' : ''} onClick={onNavClick}>
            <span style={{ width: 18, textAlign: 'center' }}>{link.icon}</span>
            {link.label}
          </Link>
        )
      })}
      <div style={{ marginTop: 'auto', borderTop: '1px solid #1f2937', paddingTop: '1rem' }}>
        <form action="/api/auth/logout" method="POST">
          <button type="submit" style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '0.875rem', cursor: 'pointer', padding: '0.5rem 1.25rem', width: '100%', textAlign: 'left' }}>
            Sign out
          </button>
        </form>
      </div>
    </nav>
  )
}
