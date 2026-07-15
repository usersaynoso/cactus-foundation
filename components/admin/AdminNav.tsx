'use client'

import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ResolvedNavItem, ResolvedNavSection, NavVisibilityMode } from '@/lib/nav/admin-menu'
import AboutModal from './AboutModal'

type Props = {
  adminPath: string
  version: string
  sections: ResolvedNavSection[]
  collapsed?: boolean
  onNavClick?: () => void
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

const STAR_OUTLINE = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9 6.8 19l1-5.8L3.6 9.1l5.8-.8z" /></svg>
)
const STAR_FILLED = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9 6.8 19l1-5.8L3.6 9.1l5.8-.8z" /></svg>
)
const STAR_SECTION_ICON = (
  <svg {...ICON_PROPS} width={16} height={16}><path d="M12 3l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9 6.8 19l1-5.8L3.6 9.1l5.8-.8z" /></svg>
)
const CLOCK_ICON = (
  <svg {...ICON_PROPS} width={16} height={16}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
)
const PLUS_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
)
const SEARCH_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
)
const LOCK_ICON = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
)
const EYE_OFF_ICON = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9.9 5.1A9.5 9.5 0 0 1 12 5c6 0 9 7 9 7a15 15 0 0 1-2.3 3.2M6.2 6.2A15 15 0 0 0 3 12s3 7 9 7a9.4 9.4 0 0 0 3.7-.7" /><path d="M3 3l18 18" /></svg>
)

const SECTIONS_COLLAPSE_KEY = 'cactus-sidebar-sections-collapsed'
const FAVOURITES_KEY = 'cactus-sidebar-favourites'
const RECENTS_KEY = 'cactus-sidebar-recents'
const FAV_SECTION = '__favourites'
const RECENT_SECTION = '__recent'
const MAX_RECENTS = 5

type RecentEntry = { path: string; label: string }

function restrictedLabel(mode: NavVisibilityMode): string {
  if (mode === 'hidden') return 'Hidden from the sidebar for everyone but administrators'
  if (mode === 'admin') return 'Only administrators can see this'
  return 'Only selected roles can see this'
}

export default function AdminNav({ adminPath, version, sections, collapsed, onNavClick }: Props) {
  const pathname = usePathname()
  const base = `/${adminPath}`
  const navRef = useRef<HTMLElement>(null)

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const [favourites, setFavourites] = useState<string[]>([])
  const [recents, setRecents] = useState<RecentEntry[]>([])
  const [filter, setFilter] = useState('')
  const [pendingPath, setPendingPath] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  // Collapsed-rail tooltip: the scroll container clips horizontally, so a
  // fixed-positioned portal to <body> is the only way the tip escapes the rail.
  const [tip, setTip] = useState<{ text: string; top: number; left: number } | null>(null)

  const showTip = useCallback((el: HTMLElement, text: string) => {
    const r = el.getBoundingClientRect()
    setTip({ text, top: r.top + r.height / 2, left: r.right + 8 })
  }, [])
  const hideTip = useCallback(() => setTip(null), [])

  const tipProps = (label: string) =>
    collapsed
      ? {
          'aria-label': label,
          onMouseEnter: (e: React.MouseEvent<HTMLElement>) => showTip(e.currentTarget, label),
          onMouseLeave: hideTip,
          onFocus: (e: React.FocusEvent<HTMLElement>) => showTip(e.currentTarget, label),
          onBlur: hideTip,
        }
      : {}

  // Flat id -> item map across every visible section, for favourites/recents/filter.
  const itemsById = useMemo(() => {
    const map = new Map<string, ResolvedNavItem>()
    for (const section of sections) for (const item of section.items) map.set(item.id, item)
    return map
  }, [sections])

  const allItems = useMemo(() => sections.flatMap((s) => s.items), [sections])

  // Read persisted preferences after mount — reading localStorage in a useState
  // initialiser makes the client's first render diverge from the server HTML.
  useEffect(() => {
    try {
      const rawSections = localStorage.getItem(SECTIONS_COLLAPSE_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read after mount, not in the initialiser, or first client render diverges from server HTML
      if (rawSections) setCollapsedSections(JSON.parse(rawSections))
      const rawFav = localStorage.getItem(FAVOURITES_KEY)
      if (rawFav) setFavourites(JSON.parse(rawFav))
      const rawRecent = localStorage.getItem(RECENTS_KEY)
      if (rawRecent) setRecents(JSON.parse(rawRecent))
    } catch {
      // ignore malformed cache
    }
  }, [])

  const isActive = useCallback(
    (href: string) => pathname === href || (href !== base && pathname.startsWith(href)),
    [pathname, base]
  )

  // Clear the click spinner once the route commits.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with the router: drop the pending marker when the navigation lands
    setPendingPath((p) => (p === null ? p : null))
  }, [pathname])

  // Record the visited top-level destination for the Recent list, and make sure
  // the section holding the active item is expanded + scrolled into view.
  useEffect(() => {
    const active = allItems.find((i) => `${base}${i.path}` === pathname)
    if (active) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with the router: record the destination the navigation just landed on
      setRecents((prev) => {
        const entry: RecentEntry = { path: active.path, label: active.label }
        const next = [entry, ...prev.filter((r) => r.path !== active.path)].slice(0, MAX_RECENTS)
        try {
          localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
        } catch {
          // ignore quota/serialisation failures
        }
        return next
      })
    }
    const section = sections.find((s) => s.items.some((it) => isActive(`${base}${it.path}`)))
    if (section?.label) {
      setCollapsedSections((prev) => (prev[section.label!] ? { ...prev, [section.label!]: false } : prev))
    }
    navRef.current?.querySelector('a.active')?.scrollIntoView({ block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run on route change only; sections/allItems are stable within a route
  }, [pathname])

  function persistSections(next: Record<string, boolean>) {
    try {
      localStorage.setItem(SECTIONS_COLLAPSE_KEY, JSON.stringify(next))
    } catch {
      // ignore
    }
  }

  function toggleSection(label: string) {
    setCollapsedSections((prev) => {
      const next = { ...prev, [label]: !prev[label] }
      persistSections(next)
      return next
    })
  }

  function toggleFavourite(id: string) {
    setFavourites((prev) => {
      const next = prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
      try {
        localStorage.setItem(FAVOURITES_KEY, JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  // Labels of every real, collapsible section currently on screen — the target
  // set for the expand-all / collapse-all control.
  const sectionLabels = useMemo(() => {
    const labels = sections.map((s) => s.label).filter((l): l is string => !!l)
    if (favourites.length > 0) labels.unshift(FAV_SECTION)
    if (recents.length > 0) labels.unshift(RECENT_SECTION)
    return labels
  }, [sections, favourites.length, recents.length])

  const anyExpanded = sectionLabels.some((l) => !collapsedSections[l])

  function toggleAll() {
    const collapseThem = anyExpanded
    setCollapsedSections((prev) => {
      const next = { ...prev }
      for (const l of sectionLabels) next[l] = collapseThem
      persistSections(next)
      return next
    })
  }

  // Keyboard: Up/Down move focus between nav items (roving), so the sidebar is
  // fully operable without a mouse. Ignored while typing in the filter box.
  function onNavKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    const items = Array.from(navRef.current?.querySelectorAll<HTMLElement>('[data-nav-item]') ?? [])
    if (items.length === 0) return
    e.preventDefault()
    const idx = items.indexOf(document.activeElement as HTMLElement)
    const next = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length
    items[next]?.focus()
  }

  function handleNavClick(path: string) {
    setPendingPath(path)
    onNavClick?.()
  }

  const createActions = useMemo(() => {
    const seen = new Set<string>()
    const actions: Array<{ label: string; path: string }> = []
    for (const item of allItems) {
      if (item.createAction && !seen.has(item.createAction.path)) {
        seen.add(item.createAction.path)
        actions.push(item.createAction)
      }
    }
    return actions
  }, [allItems])

  const filterQuery = filter.trim().toLowerCase()
  const filterMatches = filterQuery
    ? allItems.filter((i) => i.label.toLowerCase().includes(filterQuery))
    : []

  function renderItem(item: ResolvedNavItem, keyPrefix: string) {
    const href = `${base}${item.path}`
    const active = isActive(href)
    const pending = pendingPath === item.path
    const fav = favourites.includes(item.id)
    return (
      <div className="admin-nav-row" key={`${keyPrefix}:${item.id}`}>
        <Link
          href={href}
          data-nav-item=""
          className={active ? 'active' : ''}
          {...tipProps(item.label)}
          onClick={() => handleNavClick(item.path)}
        >
          <span className="admin-nav-icon">
            {item.iconIsSvg ? (
              <svg {...ICON_PROPS} dangerouslySetInnerHTML={{ __html: item.icon }} />
            ) : (
              NAV_ICONS[item.icon] ?? NAV_ICONS.modules
            )}
          </span>
          {!collapsed && <span className="admin-nav-label">{item.label}</span>}
          {!collapsed && item.restricted && (
            <span className="admin-nav-restricted" title={restrictedLabel(item.restricted)} aria-label={restrictedLabel(item.restricted)}>
              {item.restricted === 'hidden' ? EYE_OFF_ICON : LOCK_ICON}
            </span>
          )}
          {pending && <span className="admin-nav-spinner" aria-hidden="true" />}
        </Link>
        {!collapsed && (
          <button
            type="button"
            className={`admin-nav-fav-btn${fav ? ' admin-nav-fav-btn--on' : ''}`}
            onClick={() => toggleFavourite(item.id)}
            aria-pressed={fav}
            aria-label={fav ? `Unpin ${item.label} from favourites` : `Pin ${item.label} to favourites`}
            title={fav ? 'Unpin from favourites' : 'Pin to favourites'}
          >
            {fav ? STAR_FILLED : STAR_OUTLINE}
          </button>
        )}
      </div>
    )
  }

  function renderSectionHeader(storageKey: string, displayLabel: string, icon: ReactNode | null, open: boolean) {
    return (
      <button
        type="button"
        className="admin-nav-section-label"
        onClick={() => toggleSection(storageKey)}
        aria-expanded={open}
      >
        <span className="admin-nav-section-label-text">
          {icon && <span className="admin-nav-section-icon">{icon}</span>}
          {displayLabel}
        </span>
        <span className={`admin-nav-section-chevron${open ? '' : ' admin-nav-section-chevron--collapsed'}`}>{SECTION_CHEVRON}</span>
      </button>
    )
  }

  const favouriteItems = favourites
    .map((id) => itemsById.get(id))
    .filter((i): i is ResolvedNavItem => !!i)

  return (
    <nav ref={navRef} onKeyDown={onNavKeyDown}>
      {/* Toolbar: filter, quick-create, expand/collapse-all. Hidden on the icon rail. */}
      {!collapsed && (
        <div className="admin-nav-tools">
          <div className="admin-nav-filter-wrap">
            <span className="admin-nav-filter-icon">{SEARCH_ICON}</span>
            <input
              type="text"
              className="admin-nav-filter"
              placeholder="Filter menu…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="Filter the admin menu"
            />
            {filter && (
              <button type="button" className="admin-nav-filter-clear" onClick={() => setFilter('')} aria-label="Clear filter">×</button>
            )}
          </div>
          {createActions.length > 0 && (
            <div className="admin-nav-new-wrap">
              <button
                type="button"
                className="admin-nav-tool-btn admin-nav-new-btn"
                onClick={() => setNewOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={newOpen}
                title="Create something new"
              >
                {PLUS_ICON}<span>New</span>
              </button>
              {newOpen && (
                <>
                  <div className="admin-nav-new-backdrop" onClick={() => setNewOpen(false)} aria-hidden="true" />
                  <div className="admin-nav-new-menu" role="menu">
                    {createActions.map((action) => (
                      <Link
                        key={action.path}
                        href={`${base}${action.path}`}
                        role="menuitem"
                        className="admin-nav-new-item"
                        onClick={() => { setNewOpen(false); handleNavClick(action.path) }}
                      >
                        {PLUS_ICON}<span>{action.label}</span>
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          <button
            type="button"
            className="admin-nav-tool-btn"
            onClick={toggleAll}
            title={anyExpanded ? 'Collapse all sections' : 'Expand all sections'}
            aria-label={anyExpanded ? 'Collapse all sections' : 'Expand all sections'}
          >
            {anyExpanded ? '⊟' : '⊞'}
          </button>
        </div>
      )}

      {/* Filter results replace the normal tree while a query is present. */}
      {!collapsed && filterQuery ? (
        <div className="admin-nav-filter-results">
          {filterMatches.length === 0 ? (
            <p className="admin-nav-empty">No menu items match “{filter}”.</p>
          ) : (
            filterMatches.map((item) => renderItem(item, 'filter'))
          )}
        </div>
      ) : (
        <>
          {/* Favourites */}
          {!collapsed && favouriteItems.length > 0 && (
            <div>
              {renderSectionHeader(FAV_SECTION, 'Favourites', STAR_SECTION_ICON, !collapsedSections[FAV_SECTION])}
              {!collapsedSections[FAV_SECTION] && favouriteItems.map((item) => renderItem(item, 'fav'))}
            </div>
          )}

          {/* Recently visited */}
          {!collapsed && recents.length > 0 && (
            <div>
              {renderSectionHeader(RECENT_SECTION, 'Recent', CLOCK_ICON, !collapsedSections[RECENT_SECTION])}
              {!collapsedSections[RECENT_SECTION] &&
                recents.map((r) => (
                  <div className="admin-nav-row" key={`recent:${r.path}`}>
                    <Link
                      href={`${base}${r.path}`}
                      data-nav-item=""
                      className={isActive(`${base}${r.path}`) ? 'active' : ''}
                      onClick={() => handleNavClick(r.path)}
                    >
                      <span className="admin-nav-icon">{CLOCK_ICON}</span>
                      <span className="admin-nav-label">{r.label}</span>
                      {pendingPath === r.path && <span className="admin-nav-spinner" aria-hidden="true" />}
                    </Link>
                  </div>
                ))}
            </div>
          )}

          {/* Real sections (already ordered + filtered by the server) */}
          {sections.map((section, sectionIndex) => {
            const open = collapsed || !section.label || !collapsedSections[section.label]
            return (
              <div key={section.id}>
                {sectionIndex > 0 && collapsed && <div className="admin-nav-divider" />}
                {!collapsed && section.label && renderSectionHeader(section.label, section.label, null, open)}
                {open && section.items.map((item) => renderItem(item, section.id))}
              </div>
            )
          })}
        </>
      )}

      <div className="admin-nav-footer">
        <div className="admin-nav-row">
          <Link
            href={`${base}/account`}
            data-nav-item=""
            className={`admin-nav-account${collapsed ? ' admin-nav-account--collapsed' : ''}${isActive(`${base}/account`) ? ' active' : ''}`}
            {...tipProps('My Account')}
            onClick={() => handleNavClick('/account')}
          >
            <span className="admin-nav-icon">{NAV_ICONS.account}</span>
            {!collapsed && 'My Account'}
          </Link>
        </div>
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            data-nav-item=""
            className={`admin-nav-logout${collapsed ? ' admin-nav-logout--collapsed' : ''}`}
            {...tipProps('Sign out')}
          >
            <span className="admin-nav-icon">{NAV_ICONS.logout}</span>
            {!collapsed && 'Sign out'}
          </button>
        </form>
        {!collapsed && (
          <button
            type="button"
            className="admin-nav-version admin-nav-version-btn"
            onClick={() => setAboutOpen(true)}
            title="About Cactus Foundation"
          >
            Cactus Foundation v{version}
          </button>
        )}
      </div>
      {aboutOpen && <AboutModal version={version} onClose={() => setAboutOpen(false)} />}
      {tip && typeof document !== 'undefined' && createPortal(
        <div className="admin-nav-tip" role="tooltip" style={{ top: tip.top, left: tip.left }}>
          {tip.text}
        </div>,
        document.body
      )}
    </nav>
  )
}
