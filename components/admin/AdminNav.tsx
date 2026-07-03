'use client'

import { useState, useEffect, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Role } from '@prisma/client'

type ModuleNavGroup = {
  label: string | null
  links: Array<{ label: string; path: string; icon?: string }>
}

type Props = {
  adminPath: string
  userRole: Role
  version: string
  collapsed?: boolean
  onNavClick?: () => void
  moduleNavGroups?: ModuleNavGroup[]
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
  modules: (
    <svg {...ICON_PROPS}><path d="M9 3.5v3a1.5 1.5 0 0 0 3 0v-3H16a1 1 0 0 1 1 1V8a1.5 1.5 0 0 0 0 3v4a1 1 0 0 1-1 1h-3.5a1.5 1.5 0 0 0-3 0H6a1 1 0 0 1-1-1v-3.5a1.5 1.5 0 0 0 0-3V5a1 1 0 0 1 1-1z" /></svg>
  ),
  config: (
    <svg {...ICON_PROPS}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.36.36.86.58 1.51.7A2 2 0 0 1 21 12a2 2 0 0 1-1.6 1.96 1.65 1.65 0 0 0-1 1.04z" /></svg>
  ),
  account: (
    <svg {...ICON_PROPS}><circle cx="12" cy="8" r="4" /><path d="M20 21a8 8 0 1 0-16 0" /></svg>
  ),
  logout: (
    <svg {...ICON_PROPS}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
  ),
}

const SECTION_CHEVRON = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
)

const SECTIONS_COLLAPSE_KEY = 'cactus-sidebar-sections-collapsed'

const NAV_SECTIONS: { label: string | null; links: { path: string; label: string; icon: string }[] }[] = [
  {
    label: null,
    links: [{ path: '', label: 'Dashboard', icon: 'dashboard' }],
  },
  {
    label: 'Content',
    links: [
      { path: '/pages', label: 'Pages', icon: 'pages' },
      { path: '/menus', label: 'Menus', icon: 'menus' },
      { path: '/media', label: 'Media', icon: 'media' },
    ],
  },
  {
    label: 'System',
    links: [
      { path: '/users',      label: 'Users',    icon: 'users' },
      { path: '/appearance', label: 'Styles',   icon: 'appearance' },
      { path: '/layouts',    label: 'Layouts',  icon: 'layouts' },
      { path: '/modules',    label: 'Modules',  icon: 'modules' },
      { path: '/config',     label: 'Settings', icon: 'config' },
    ],
  },
]

export default function AdminNav({ adminPath, version, collapsed, onNavClick, moduleNavGroups }: Props) {
  const pathname = usePathname()
  const base = `/${adminPath}`
  // Maps section label -> true when the user has minimised it. Defaults to
  // empty (i.e. everything maximised) when there's no saved state.
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})

  // Read the saved preference after mount — reading localStorage synchronously in a
  // useState initializer makes the client's first render diverge from the
  // server-rendered HTML and trips a hydration error.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SECTIONS_COLLAPSE_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- must read after mount, not in the initializer, or the client's first render diverges from server HTML
      if (raw) setCollapsedSections(JSON.parse(raw))
    } catch {
      // ignore malformed cache
    }
  }, [])

  function toggleSection(label: string) {
    setCollapsedSections((prev) => {
      const next = { ...prev, [label]: !prev[label] }
      localStorage.setItem(SECTIONS_COLLAPSE_KEY, JSON.stringify(next))
      return next
    })
  }

  function isActive(href: string) {
    return pathname === href || (href !== base && pathname.startsWith(href))
  }

  // Ungrouped module links (e.g. contact-form's Inbox) sit directly under
  // Dashboard as plain links (no "Modules" heading) so they read as part of
  // the Dashboard section, not a separate collapsible bucket. Labelled module
  // groups (their own named section, e.g. "Gazette") render right after Content.
  const ungroupedModuleLinks = moduleNavGroups?.filter((group) => !group.label).flatMap((group) => group.links) ?? []
  const labelledModuleGroups = moduleNavGroups?.filter((group) => group.label) ?? []

  function renderModuleGroup(group: ModuleNavGroup, key: string, fallbackIcon: keyof typeof NAV_ICONS = 'modules') {
    const groupLabel = group.label ?? 'Modules'
    const groupOpen = collapsed || !collapsedSections[groupLabel]
    return (
      <div key={key}>
        {collapsed ? (
          <div className="admin-nav-divider" />
        ) : (
          <button
            type="button"
            className="admin-nav-section-label"
            onClick={() => toggleSection(groupLabel)}
            aria-expanded={groupOpen}
          >
            <span>{groupLabel}</span>
            <span className={`admin-nav-section-chevron${groupOpen ? '' : ' admin-nav-section-chevron--collapsed'}`}>{SECTION_CHEVRON}</span>
          </button>
        )}
        {groupOpen && group.links.map((entry) => {
          const href = `${base}${entry.path}`
          return (
            <Link
              key={href}
              href={href}
              className={isActive(href) ? 'active' : ''}
              title={collapsed ? entry.label : undefined}
              onClick={onNavClick}
            >
              <span className="admin-nav-icon">
                {entry.icon?.trimStart().startsWith('<') ? (
                  <svg {...ICON_PROPS} dangerouslySetInnerHTML={{ __html: entry.icon }} />
                ) : (
                  NAV_ICONS[fallbackIcon]
                )}
              </span>
              {!collapsed && entry.label}
            </Link>
          )
        })}
      </div>
    )
  }

  return (
    <nav>
      {NAV_SECTIONS.map((section, sectionIndex) => {
        const sectionOpen = collapsed || !section.label || !collapsedSections[section.label]
        return (
        <div key={section.label ?? `section-${sectionIndex}`}>
          {sectionIndex > 0 && (collapsed ? <div className="admin-nav-divider" /> : null)}
          {!collapsed && section.label && (
            <button
              type="button"
              className="admin-nav-section-label"
              onClick={() => toggleSection(section.label!)}
              aria-expanded={sectionOpen}
            >
              <span>{section.label}</span>
              <span className={`admin-nav-section-chevron${sectionOpen ? '' : ' admin-nav-section-chevron--collapsed'}`}>{SECTION_CHEVRON}</span>
            </button>
          )}
          {sectionOpen && section.links.map((link) => {
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
          {sectionIndex === 0 && ungroupedModuleLinks.map((entry) => {
            const href = `${base}${entry.path}`
            return (
              <Link
                key={href}
                href={href}
                className={isActive(href) ? 'active' : ''}
                title={collapsed ? entry.label : undefined}
                onClick={onNavClick}
              >
                <span className="admin-nav-icon">
                  {entry.icon?.trimStart().startsWith('<') ? (
                    <svg {...ICON_PROPS} dangerouslySetInnerHTML={{ __html: entry.icon }} />
                  ) : (
                    NAV_ICONS.modules
                  )}
                </span>
                {!collapsed && entry.label}
              </Link>
            )
          })}
          {section.label === 'Content' &&
            labelledModuleGroups.map((group, groupIndex) => renderModuleGroup(group, group.label ?? `modules-${groupIndex}`))}
        </div>
        )
      })}

      <div className="admin-nav-footer">
        <Link
          href={`${base}/account`}
          className={`admin-nav-account${collapsed ? ' admin-nav-account--collapsed' : ''}`}
          title={collapsed ? 'My Account' : undefined}
          onClick={onNavClick}
        >
          <span className="admin-nav-icon">{NAV_ICONS.account}</span>
          {!collapsed && 'My Account'}
        </Link>
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className={`admin-nav-logout${collapsed ? ' admin-nav-logout--collapsed' : ''}`}
            title={collapsed ? 'Sign out' : undefined}
          >
            <span className="admin-nav-icon">{NAV_ICONS.logout}</span>
            {!collapsed && 'Sign out'}
          </button>
        </form>
        {!collapsed && (
          <p className="admin-nav-version">v{version}</p>
        )}
      </div>
    </nav>
  )
}
