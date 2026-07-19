'use client'

import { type CSSProperties, type ReactNode, useEffect, useState } from 'react'
import { SORTS, type Sort, type TypeFilter, type UseFilter, type ViewMode, type TagInfo } from './types'

// The filter/search/view row plus a chip strip beneath it summarising every
// active narrowing, each chip individually removable. Keeps the controls tidy on
// one line and makes "why am I seeing this subset" answerable at a glance.
export default function MediaToolbar({
  searchInput,
  onSearchInput,
  onSearchSubmit,
  sort,
  onSort,
  type,
  onType,
  use,
  onUse,
  optimisableOnly,
  onOptimisableOnly,
  tagFilter,
  onTagFilter,
  tags,
  view,
  onView,
  activeSearch,
  onClearAll,
}: {
  searchInput: string
  onSearchInput: (v: string) => void
  /** Commit a search. Called with no arg to submit the current input, or an explicit value (e.g. '' to clear). */
  onSearchSubmit: (value?: string) => void
  sort: Sort
  onSort: (v: Sort) => void
  type: TypeFilter
  onType: (v: TypeFilter) => void
  use: UseFilter
  onUse: (v: UseFilter) => void
  /** Set by the "Optimisable" stat tile rather than by a dropdown, so it only ever appears as a chip. */
  optimisableOnly: boolean
  onOptimisableOnly: (v: boolean) => void
  tagFilter: string
  onTagFilter: (v: string) => void
  tags: TagInfo[]
  view: ViewMode
  onView: (v: ViewMode) => void
  /** The committed search term (not the in-progress input) - drives the chip. */
  activeSearch: string
  onClearAll: () => void
}) {
  const chips: { key: string; label: string; onRemove: () => void }[] = []
  if (activeSearch) chips.push({ key: 'q', label: `Search: “${activeSearch}”`, onRemove: () => { onSearchInput(''); onSearchSubmit('') } })
  if (type !== 'all') chips.push({ key: 'type', label: type === 'image' ? 'Images only' : 'Other files', onRemove: () => onType('all') })
  if (use !== 'all') chips.push({ key: 'use', label: use === 'in-use' ? 'In use' : 'Not in use', onRemove: () => onUse('all') })
  if (optimisableOnly) chips.push({ key: 'optimisable', label: 'Still to optimise', onRemove: () => onOptimisableOnly(false) })
  if (tagFilter) chips.push({ key: 'tag', label: `Tag: ${tagFilter}`, onRemove: () => onTagFilter('') })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
        <form
          onSubmit={(e) => { e.preventDefault(); onSearchSubmit() }}
          style={{ flex: '1 1 220px', minWidth: 180, position: 'relative', display: 'flex', alignItems: 'center' }}
        >
          <span aria-hidden style={{ position: 'absolute', left: '0.6rem', color: 'var(--color-text-muted)', pointerEvents: 'none', fontSize: '0.9rem' }}>⌕</span>
          <input
            value={searchInput}
            onChange={(e) => onSearchInput(e.target.value)}
            placeholder="Search all folders…"
            aria-label="Search media"
            style={{ ...inputStyle, paddingLeft: '1.9rem' }}
          />
        </form>

        <Select value={sort} onChange={(v) => onSort(v as Sort)} label="Sort order">
          {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
        <Select value={type} onChange={(v) => onType(v as TypeFilter)} label="File type">
          <option value="all">All types</option>
          <option value="image">Images</option>
          <option value="other">Other files</option>
        </Select>
        <Select value={use} onChange={(v) => onUse(v as UseFilter)} label="Usage">
          <option value="all">All usage</option>
          <option value="in-use">In use</option>
          <option value="unused">Not in use</option>
        </Select>
        {tags.length > 0 && (
          <Select value={tagFilter} onChange={onTagFilter} label="Filter by tag">
            <option value="">All tags</option>
            {tags.map((t) => <option key={t.id} value={t.name}>{t.name} ({t.count})</option>)}
          </Select>
        )}

        <ViewToggle view={view} onView={onView} />
      </div>

      {chips.length > 0 && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
          {chips.map((c) => (
            <span
              key={c.key}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: 'var(--text-xs)',
                padding: '0.2rem 0.35rem 0.2rem 0.6rem',
                borderRadius: 'var(--radius-full)',
                background: 'var(--color-primary-subtle)',
                color: 'var(--color-primary-dark)',
                border: '1px solid var(--color-primary-border)',
              }}
            >
              {c.label}
              <button
                type="button"
                onClick={c.onRemove}
                aria-label={`Remove ${c.label}`}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1, fontSize: '0.95rem' }}
              >
                ×
              </button>
            </span>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClearAll}>Clear all</button>
        </div>
      )}
    </div>
  )
}

function Select({ value, onChange, label, children }: { value: string; onChange: (v: string) => void; label: string; children: ReactNode }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} style={selectStyle}>
      {children}
    </select>
  )
}

function ViewToggle({ view, onView }: { view: ViewMode; onView: (v: ViewMode) => void }) {
  const btn = (mode: ViewMode, label: string, glyph: string): CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '2.1rem',
    height: '2.1rem',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    background: view === mode ? 'var(--color-surface)' : 'transparent',
    boxShadow: view === mode ? 'var(--shadow-sm)' : 'none',
    color: view === mode ? 'var(--color-text)' : 'var(--color-text-muted)',
    cursor: 'pointer',
    fontSize: '0.95rem',
    fontFamily: 'inherit',
  })
  return (
    <div
      role="group"
      aria-label="View mode"
      style={{ display: 'inline-flex', gap: '0.15rem', padding: '0.2rem', borderRadius: 'var(--radius)', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)' }}
    >
      <button type="button" aria-pressed={view === 'grid'} aria-label="Grid view" title="Grid view" onClick={() => onView('grid')} style={btn('grid', 'Grid', '▦')}>▦</button>
      <button type="button" aria-pressed={view === 'list'} aria-label="List view" title="List view" onClick={() => onView('list')} style={btn('list', 'List', '☰')}>☰</button>
    </div>
  )
}

const inputStyle: CSSProperties = { padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', width: '100%', fontFamily: 'inherit', fontSize: 'var(--text-base)', background: 'var(--color-surface)', color: 'var(--color-text)' }
const selectStyle: CSSProperties = { height: 36, padding: '0 var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', fontFamily: 'inherit', fontSize: 'var(--text-sm)', background: 'var(--color-surface)', color: 'var(--color-text)', cursor: 'pointer' }
