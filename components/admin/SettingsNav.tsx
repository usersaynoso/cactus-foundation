'use client'

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import type { TabStripItem } from './TabStrip'

// The Settings page can list its tabs down a sidebar instead of across the top
// (Settings > General > Site), with each page's own sub-tabs as a tree under the one
// that is open. Core knows its own sub-tabs. A module's settings tab draws its
// sub-tabs itself, with the shared <TabStrip>, so core cannot see them - instead the
// strip reports itself here, and the sidebar reads them back.
//
// Only strips inside a <SettingsNavCapture> report in (core wraps the module's tab in
// one), so the core strips in the Settings bar, and every TabStrip anywhere else in
// the admin, are left alone. Where a module draws more than one strip - a strip
// inside one of its own sub-tabs, say - the first one drawn is the page's sub-tabs
// and the rest are its business. That first strip is given the same class as core's
// own sub-tab strip, so when the owner has asked for the sub-tabs to be hidden the
// stylesheet hides it with the rest - on a screen wide enough for the sidebar only,
// so a phone still has a way round. The module's own state still decides which
// sub-tab is showing, so nothing about it has to change.

type CapturedItem = { key: string; label: ReactNode; active: boolean; href?: string }

type Store = {
  register: (id: number, items: TabStripItem[]) => void
  unregister: (id: number) => void
  primaryId: number | null
  primaryItems: CapturedItem[]
  click: (key: string, event: React.MouseEvent<HTMLElement>) => void
}

const StoreContext = createContext<Store | null>(null)
const CaptureContext = createContext(false)

let nextStripId = 0

function signature(items: TabStripItem[]): string {
  return items.map((i) => `${i.key}\u0001${i.active ? 1 : 0}\u0001${typeof i.label === 'string' ? i.label : ''}\u0001${i.href ?? ''}`).join('\u0002')
}

export function SettingsNavProvider({ children }: { children: ReactNode }) {
  // Latest items per strip, for click handlers (which close over the module's own
  // state and so must be the newest copy). What the sidebar draws comes from state,
  // and only changes when a key, label or active flag does - a module re-rendering
  // for some other reason never re-renders the sidebar.
  const latest = useRef(new Map<number, TabStripItem[]>())
  const [strips, setStrips] = useState<Map<number, { sig: string; items: CapturedItem[] }>>(() => new Map())

  const register = useCallback((id: number, items: TabStripItem[]) => {
    latest.current.set(id, items)
    const sig = signature(items)
    setStrips((prev) => {
      if (prev.get(id)?.sig === sig) return prev
      const next = new Map(prev)
      next.set(id, { sig, items: items.map(({ key, label, active, href }) => ({ key, label, active, href })) })
      return next
    })
  }, [])

  const unregister = useCallback((id: number) => {
    latest.current.delete(id)
    setStrips((prev) => {
      if (!prev.has(id)) return prev
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  const primaryId = strips.size > 0 ? Math.min(...strips.keys()) : null

  const click = useCallback((key: string, event: React.MouseEvent<HTMLElement>) => {
    if (primaryId === null) return
    latest.current.get(primaryId)?.find((i) => i.key === key)?.onClick?.(event)
  }, [primaryId])

  const value = useMemo<Store>(
    () => ({
      register,
      unregister,
      primaryId,
      primaryItems: primaryId === null ? [] : strips.get(primaryId)?.items ?? [],
      click,
    }),
    [register, unregister, primaryId, strips, click],
  )
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

/** Marks a module's settings tab: the first TabStrip inside it is that page's sub-tabs. */
export function SettingsNavCapture({ children }: { children: ReactNode }) {
  return <CaptureContext.Provider value>{children}</CaptureContext.Provider>
}

/** Called by TabStrip. Reports the strip when it is a captured settings strip, and
 * answers whether it is the page's sub-tab strip (the first one a module draws). */
export function useSettingsNavStrip(items: TabStripItem[]): boolean {
  const store = useContext(StoreContext)
  const capture = useContext(CaptureContext)
  // Strips are numbered in the order they are first drawn, so the outermost strip of
  // a module's tab - drawn before anything inside its panels - has the lowest number.
  const [id] = useState(() => ++nextStripId)
  const live = store !== null && capture
  const register = store?.register
  const unregister = store?.unregister

  useLayoutEffect(() => {
    if (live && register) register(id, items)
  })
  useLayoutEffect(() => {
    if (!live || !unregister) return
    return () => unregister(id)
  }, [live, unregister, id])

  return store !== null && capture && store.primaryId === id
}

export type SettingsNavNode = {
  key: string
  label: ReactNode
  active: boolean
  onClick: () => void
  children?: SettingsNavNode[]
  /** The open module page: its own sub-tabs (if it draws any) hang off this node. */
  capturesModuleTabs?: boolean
}

const linkStyle = (active: boolean, depth: number): React.CSSProperties => ({
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: depth === 0 ? '0.5rem 0.75rem' : '0.375rem 0.75rem',
  border: 'none',
  borderRadius: 'var(--radius)',
  background: active && depth === 0 ? 'var(--color-primary-subtle, var(--color-bg-subtle))' : 'none',
  color: active ? 'var(--color-primary)' : depth === 0 ? 'var(--color-text)' : 'var(--color-text-muted)',
  fontWeight: active ? 600 : 400,
  fontSize: depth === 0 ? 'var(--text-sm)' : '0.8125rem',
  fontFamily: 'inherit',
  cursor: 'pointer',
  textDecoration: 'none',
  lineHeight: 1.35,
})

/** The Settings sidebar. Only the open tab's tree is unfolded. */
export function SettingsSidebar({ nodes }: { nodes: SettingsNavNode[] }) {
  const store = useContext(StoreContext)
  const captured = store?.primaryItems ?? []

  function renderCaptured(depth: number) {
    if (captured.length < 2) return null
    return (
      <ul className="settings-sidebar__tree">
        {captured.map((item) => (
          <li key={item.key}>
            {item.href ? (
              <Link href={item.href} prefetch={false} style={linkStyle(item.active, depth)} aria-current={item.active ? 'page' : undefined} onClick={(e) => store?.click(item.key, e)}>
                {item.label}
              </Link>
            ) : (
              <button type="button" style={linkStyle(item.active, depth)} aria-current={item.active ? 'page' : undefined} onClick={(e) => store?.click(item.key, e)}>
                {item.label}
              </button>
            )}
          </li>
        ))}
      </ul>
    )
  }

  function renderNodes(list: SettingsNavNode[], depth: number): ReactNode {
    return list.map((node) => {
      const kids = node.active ? node.children ?? [] : []
      return (
        <li key={node.key}>
          <button
            type="button"
            style={linkStyle(node.active, depth)}
            aria-current={node.active ? 'page' : undefined}
            aria-expanded={node.children && node.children.length > 0 ? node.active : undefined}
            onClick={node.onClick}
          >
            {node.label}
          </button>
          {kids.length > 0 && <ul className="settings-sidebar__tree">{renderNodes(kids, depth + 1)}</ul>}
          {node.active && node.capturesModuleTabs && renderCaptured(depth + 1)}
        </li>
      )
    })
  }

  return (
    <nav className="settings-sidebar" aria-label="Settings">
      <ul className="settings-sidebar__list">{renderNodes(nodes, 0)}</ul>
    </nav>
  )
}
