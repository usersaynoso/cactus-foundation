'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import type { ResolvedNavSection } from '@/lib/nav/admin-menu'

type Props = {
  adminPath: string
  sections: ResolvedNavSection[]
}

type Command = {
  id: string
  label: string
  hint: string | null
  href: string
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

export default function CommandPalette({ adminPath, sections }: Props) {
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
    for (const section of sections) {
      for (const item of section.items) {
        if (!seen.has(item.id)) {
          seen.add(item.id)
          out.push({ id: item.id, label: item.label, hint: section.label, href: `${base}${item.path}` })
        }
        if (item.createAction) {
          const cid = `create:${item.createAction.path}`
          if (!seen.has(cid)) {
            seen.add(cid)
            out.push({ id: cid, label: item.createAction.label, hint: 'Create', href: `${base}${item.createAction.path}` })
          }
        }
      }
    }
    return out
  }, [sections, base])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return commands
      .map((c) => ({ c, s: score(q, c.label) }))
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
              placeholder="Jump to…  (type a page name)"
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
