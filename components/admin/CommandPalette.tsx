'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import type { ResolvedNavSection } from '@/lib/nav/admin-menu'
import { ADMIN_SEARCH_ENTRIES } from '@/lib/admin/search-index'

type Props = {
  adminPath: string
  sections: ResolvedNavSection[]
  /** Module-provided Settings tabs the user may open, permission-filtered server-side. */
  moduleSettingsTabs?: Array<{ id: string; label: string }>
}

type Command = {
  id: string
  label: string
  hint: string | null
  href: string
  /** Extra terms that should match this command beyond its label. */
  keywords: string[]
}

const SHORTCUTS: Array<{ keys: string; description: string }> = [
  { keys: '⌘K / Ctrl+K', description: 'Open this command palette' },
  { keys: '↑ ↓', description: 'Move between results (and menu items)' },
  { keys: '↵', description: 'Open the highlighted result' },
  { keys: 'Esc', description: 'Close the palette' },
  { keys: '?', description: 'Show this shortcuts list' },
]

// Lightweight subsequence match: every character of the query appears in order
// somewhere in the target. Ranks exact-substring hits above scattered ones so
// "med" surfaces "Media" before "Modules > Something Embedded".
function score(query: string, target: string): number {
  if (!query) return 1
  const t = target.toLowerCase()
  const idx = t.indexOf(query)
  if (idx !== -1) return 1000 - idx
  let qi = 0
  for (let i = 0; i < t.length && qi < query.length; i++) {
    if (t[i] === query[qi]) qi++
  }
  return qi === query.length ? 100 - (t.length - query.length) : -1
}

// Best match for a command across its label, its keywords, and its breadcrumb hint.
// A label hit always outranks a keyword hit, which outranks a hint-only hit, so
// "backup" surfaces the Backup control before a page that merely mentions it.
function scoreCommand(query: string, c: Command): number {
  if (!query) return 0
  let best = score(query, c.label)
  if (best >= 0) best += 1000 // label matches float to the top
  for (const kw of c.keywords) {
    const s = score(query, kw)
    if (s > best) best = s
  }
  if (c.hint) {
    const s = score(query, c.hint) - 200 // context match, but weaker than a real target
    if (s > best) best = s
  }
  return best
}

export default function CommandPalette({ adminPath, sections, moduleSettingsTabs }: Props) {
  const router = useRouter()
  const base = `/${adminPath}`
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'search' | 'help'>('search')
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const commands = useMemo<Command[]>(() => {
    const out: Command[] = []
    const seen = new Set<string>()
    // The set of nav destinations this user can actually open - used to gate the
    // deeper settings entries so search never links someone to a screen their role
    // hides. A settings sub-entry is only offered when its parent page is visible.
    const visiblePaths = new Set<string>()

    for (const section of sections) {
      for (const item of section.items) {
        visiblePaths.add(item.path)
        if (!seen.has(item.id)) {
          seen.add(item.id)
          out.push({ id: item.id, label: item.label, hint: section.label, href: `${base}${item.path}`, keywords: [] })
        }
        if (item.createAction) {
          const cid = `create:${item.createAction.path}`
          if (!seen.has(cid)) {
            seen.add(cid)
            out.push({ id: cid, label: item.createAction.label, hint: 'Create', href: `${base}${item.createAction.path}`, keywords: [] })
          }
        }
      }
    }

    // Deep settings / section entries, hidden when their parent page isn't visible.
    for (const entry of ADMIN_SEARCH_ENTRIES) {
      if (entry.requires && !visiblePaths.has(entry.requires)) continue
      if (seen.has(entry.id)) continue
      seen.add(entry.id)
      out.push({ id: entry.id, label: entry.label, hint: entry.section, href: `${base}${entry.path}`, keywords: entry.keywords ?? [] })
    }

    // Module-provided Settings tabs (Shop, Gazette, …). Already permission-filtered
    // server-side, and they render inside Settings, so a tab deep-link is enough.
    for (const t of moduleSettingsTabs ?? []) {
      const id = `modtab:${t.id}`
      if (seen.has(id)) continue
      seen.add(id)
      out.push({ id, label: `${t.label} settings`, hint: 'Settings', href: `${base}/config?tab=${encodeURIComponent(t.id)}`, keywords: [t.label, 'module', 'settings'] })
    }

    return out
  }, [sections, base, moduleSettingsTabs])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return commands
      .map((c) => ({ c, s: scoreCommand(q, c) }))
      .filter((r) => r.s >= 0)
      .sort((a, b) => b.s - a.s)
      .map((r) => r.c)
  }, [commands, query])

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setActive(0)
    setMode('search')
  }, [])

  const openPalette = useCallback((next: 'search' | 'help') => {
    setMode(next)
    setQuery('')
    setActive(0)
    setOpen(true)
  }, [])

  // Global shortcuts: Cmd/Ctrl+K toggles the palette; "?" opens the help view
  // (but never while the user is typing in a field). A toolbar button dispatches
  // the same custom event so the palette is discoverable without the keyboard.
  useEffect(() => {
    function isTyping(el: EventTarget | null): boolean {
      const node = el as HTMLElement | null
      if (!node) return false
      const tag = node.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || node.isContentEditable
    }
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
        setMode('search')
        setQuery('')
        setActive(0)
        return
      }
      if (e.key === '?' && !isTyping(e.target)) {
        e.preventDefault()
        openPalette('help')
      }
    }
    function onOpenEvent() {
      openPalette('search')
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('cactus:open-command-palette', onOpenEvent)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('cactus:open-command-palette', onOpenEvent)
    }
  }, [openPalette])

  useEffect(() => {
    if (open && mode === 'search') inputRef.current?.focus()
  }, [open, mode])

  // Keep the highlighted result within the scroll viewport.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function go(cmd: Command | undefined) {
    if (!cmd) return
    close()
    router.push(cmd.href)
    // A hash-only jump within the page you're already on won't change the destination
    // page's deps, and Next's pushState doesn't emit hashchange - so nudge the target
    // page (once the URL has been applied) to scroll its anchor into view.
    if (cmd.href.includes('#')) {
      setTimeout(() => window.dispatchEvent(new Event('cactus:scroll-hash')), 0)
    }
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (results.length === 0 ? 0 : (a + 1) % results.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (results.length === 0 ? 0 : (a - 1 + results.length) % results.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(results[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="cmdk-backdrop" onClick={close} role="presentation">
      <div
        className="cmdk-panel"
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'help' ? 'Keyboard shortcuts' : 'Command palette'}
        onClick={(e) => e.stopPropagation()}
      >
        {mode === 'help' ? (
          <div className="cmdk-help">
            <div className="cmdk-help-head">
              <h2>Keyboard shortcuts</h2>
              <button type="button" className="cmdk-help-back" onClick={() => openPalette('search')}>Back to search</button>
            </div>
            <ul className="cmdk-help-list">
              {SHORTCUTS.map((s) => (
                <li key={s.keys}>
                  <kbd className="cmdk-kbd">{s.keys}</kbd>
                  <span>{s.description}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            <input
              ref={inputRef}
              type="text"
              className="cmdk-input"
              placeholder="Search settings, sections, pages…"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0) }}
              onKeyDown={onInputKeyDown}
              aria-label="Search admin destinations"
            />
            <div className="cmdk-results" ref={listRef}>
              {results.length === 0 ? (
                <p className="cmdk-empty">Nothing matches “{query}”.</p>
              ) : (
                results.map((cmd, i) => (
                  <button
                    key={cmd.id}
                    type="button"
                    className={`cmdk-item${i === active ? ' cmdk-item--active' : ''}`}
                    data-active={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(cmd)}
                  >
                    <span className="cmdk-item-label">{cmd.label}</span>
                    {cmd.hint && <span className="cmdk-item-hint">{cmd.hint}</span>}
                  </button>
                ))
              )}
            </div>
            <div className="cmdk-footer">
              <span><kbd className="cmdk-kbd">↑↓</kbd> navigate</span>
              <span><kbd className="cmdk-kbd">↵</kbd> open</span>
              <span><kbd className="cmdk-kbd">esc</kbd> close</span>
              <button type="button" className="cmdk-footer-help" onClick={() => openPalette('help')}>
                <kbd className="cmdk-kbd">?</kbd> shortcuts
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
