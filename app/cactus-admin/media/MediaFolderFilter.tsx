'use client'

import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import { formatBytes } from './format'
import type { UnusedFolderOption } from './types'

// The folder narrowing on the Unused view. Opens with every folder that holds
// something spare already ticked, so it starts out saying exactly what the
// Unused tile said - the point of it is taking folders out ("everything except
// the product shots"), not building a selection up from nothing.
//
// It therefore reports what has been *un*ticked to its parent, not what is left
// ticked. A folder that only becomes relevant later - because something in it
// has just stopped being used - then arrives ticked like the rest, rather than
// missing from a list drawn up before it existed.
export default function MediaFolderFilter({
  options,
  excluded,
  onExcluded,
}: {
  options: UnusedFolderOption[]
  /** Folder keys currently unticked. Keys not in `options` are ignored here. */
  excluded: Set<string>
  onExcluded: (next: Set<string>) => void
}) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

  // Close on a click anywhere else, or on Escape - the two things anyone tries
  // when they want a popover gone.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Counted against the folders actually on offer. A leftover exclusion for a
  // folder that has since been emptied is not a narrowing anyone can see, so it
  // must not be one the button claims.
  const liveExcluded = useMemo(
    () => options.filter((o) => excluded.has(o.key)).length,
    [options, excluded],
  )
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options
  }, [options, filter])

  const label =
    liveExcluded === 0
      ? `All folders (${options.length})`
      : `${options.length - liveExcluded} of ${options.length} folders`

  function toggle(key: string) {
    const next = new Set(excluded)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onExcluded(next)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Filter by folder"
        style={{
          ...triggerStyle,
          borderColor: liveExcluded > 0 ? 'var(--color-primary)' : 'var(--color-border)',
        }}
      >
        <span aria-hidden>🗀</span>
        {label}
        <span aria-hidden style={{ color: 'var(--color-text-muted)' }}>▾</span>
      </button>

      {open && (
        <div role="group" aria-label="Folders with unused files" style={panelStyle}>
          <div style={{ display: 'flex', gap: 'var(--space-2)', padding: 'var(--space-2)', borderBottom: '1px solid var(--color-border)' }}>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Find a folder…"
              aria-label="Find a folder"
              style={filterInputStyle}
            />
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-2)', padding: 'var(--space-2)', borderBottom: '1px solid var(--color-border)' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onExcluded(new Set())}>Tick all</button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onExcluded(new Set(options.map((o) => o.key)))}
            >
              Untick all
            </button>
          </div>

          <div style={{ maxHeight: '17rem', overflowY: 'auto', padding: 'var(--space-1) 0' }}>
            {shown.length === 0 && (
              <p style={{ margin: 0, padding: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                No folder matches that.
              </p>
            )}
            {shown.map((o) => (
              <label key={o.key} style={rowStyle}>
                <input
                  type="checkbox"
                  checked={!excluded.has(o.key)}
                  onChange={() => toggle(o.key)}
                  style={{ margin: 0, flexShrink: 0 }}
                />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={o.label}>
                  {o.label}
                </span>
                <span style={{ flexShrink: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                  {o.files.toLocaleString('en-GB')} · {formatBytes(o.size)}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const triggerStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.4rem',
  height: 36,
  padding: '0 var(--space-3)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  fontFamily: 'inherit',
  fontSize: 'var(--text-sm)',
  cursor: 'pointer',
}

const panelStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 0.35rem)',
  left: 0,
  zIndex: 30,
  width: 'min(24rem, 80vw)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  boxShadow: 'var(--shadow-md)',
}

const filterInputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: 'var(--space-2) var(--space-3)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius)',
  background: 'var(--color-bg-subtle)',
  color: 'var(--color-text)',
  fontFamily: 'inherit',
  fontSize: 'var(--text-sm)',
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  padding: 'var(--space-2) var(--space-3)',
  fontSize: 'var(--text-sm)',
  color: 'var(--color-text)',
  cursor: 'pointer',
}
