'use client'

import { type CSSProperties, type DragEvent, type MouseEvent } from 'react'
import type { LibraryItem, Sort } from './types'
import { formatBytes, formatDate, filenameOf, fileKind } from './format'

// The dense alternative to the grid: one row per file with sortable columns.
// Same interaction surface as a card - click a row to open the detail panel,
// right-click for the action menu, drag to a folder to move, checkbox to select.
export default function MediaList({
  items,
  selected,
  allSelected,
  onToggleSelect,
  onToggleAll,
  onOpen,
  onContextMenu,
  draggable,
  onDragStart,
  onDragEnd,
  sort,
  onSort,
  folderName,
  clipboardIdSet,
}: {
  items: LibraryItem[]
  selected: Set<string>
  allSelected: boolean
  onToggleSelect: (id: string, shiftKey: boolean) => void
  onToggleAll: () => void
  onOpen: (id: string) => void
  onContextMenu: (e: MouseEvent, id: string) => void
  draggable: boolean
  onDragStart: (e: DragEvent, id: string) => void
  onDragEnd: () => void
  sort: Sort
  onSort: (s: Sort) => void
  folderName: (id: string | null) => string
  clipboardIdSet: Set<string>
}) {
  // Each sortable header toggles between its ascending/descending pair.
  const sortHeader = (label: string, asc: Sort, desc: Sort, align: 'left' | 'right' = 'left') => {
    const active = sort === asc || sort === desc
    const next = sort === desc ? asc : desc
    const arrow = sort === asc ? ' ▲' : sort === desc ? ' ▼' : ''
    return (
      <th style={{ textAlign: align }}>
        <button
          type="button"
          onClick={() => onSort(next)}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', font: 'inherit', color: active ? 'var(--color-text)' : 'var(--color-text-secondary)', fontWeight: active ? 600 : 500, padding: 0, display: 'inline-flex', alignItems: 'center' }}
        >
          {label}{arrow}
        </button>
      </th>
    )
  }

  return (
    <div className="table-wrapper" style={{ background: 'var(--color-surface)' }}>
      <table>
        <thead>
          <tr>
            <th style={{ width: '2.5rem' }}>
              <input
                type="checkbox"
                aria-label="Select all shown"
                checked={allSelected}
                onChange={onToggleAll}
                style={{ cursor: 'pointer', margin: 0 }}
              />
            </th>
            <th style={{ width: '3.5rem' }} aria-label="Preview" />
            {sortHeader('Name', 'name', 'name_desc')}
            <th>Type</th>
            {sortHeader('Size', 'smallest', 'largest', 'right')}
            <th>Folder</th>
            <th>Usage</th>
            {sortHeader('Uploaded', 'oldest', 'newest')}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const isImage = item.mimeType.startsWith('image/')
            const filename = filenameOf(item)
            const dimmed = clipboardIdSet.has(item.id)
            const isSelected = selected.has(item.id)
            return (
              <tr
                key={item.id}
                draggable={draggable}
                onDragStart={draggable ? (e) => onDragStart(e, item.id) : undefined}
                onDragEnd={draggable ? onDragEnd : undefined}
                onContextMenu={(e) => onContextMenu(e, item.id)}
                onClick={() => onOpen(item.id)}
                style={{ cursor: 'pointer', opacity: dimmed ? 0.5 : 1, background: isSelected ? 'var(--color-primary-subtle)' : undefined }}
              >
                <td onClick={(e) => e.stopPropagation()} style={{ width: '2.5rem' }}>
                  <input
                    type="checkbox"
                    aria-label={isSelected ? `Deselect ${filename}` : `Select ${filename}`}
                    checked={isSelected}
                    onClick={(e) => onToggleSelect(item.id, e.shiftKey)}
                    onChange={() => {}}
                    style={{ cursor: 'pointer', margin: 0 }}
                  />
                </td>
                <td style={{ width: '3.5rem' }}>
                  <span style={thumbBox}>
                    {isImage ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={item.url} alt={item.altText ?? ''} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <span style={{ fontSize: '1.1rem' }}>📄</span>
                    )}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
                    <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '22rem' }}>{filename}</span>
                    {item.optimised && <span title="Optimised to WebP" style={miniBadge}>✓</span>}
                  </div>
                  {item.tags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.25rem' }}>
                      {item.tags.slice(0, 4).map((t) => <span key={t} style={tagChip}>{t}</span>)}
                    </div>
                  )}
                </td>
                <td style={{ color: 'var(--color-text-secondary)' }}>{fileKind(item.mimeType)}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{formatBytes(item.sizeBytes)}</td>
                <td style={{ color: 'var(--color-text-secondary)' }}>{folderName(item.folderId)}</td>
                <td>
                  <span style={usagePill(item.inUse)}>{item.inUse ? 'In use' : 'Unused'}</span>
                </td>
                <td style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{formatDate(item.createdAt)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const thumbBox: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '2.25rem', height: '2.25rem', borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)' }
const miniBadge: CSSProperties = { flexShrink: 0, fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-success)', lineHeight: 1 }
const tagChip: CSSProperties = { fontSize: '0.6875rem', padding: '0.0625rem 0.375rem', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }
const usagePill = (inUse: boolean): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  fontSize: '0.6875rem',
  fontWeight: 500,
  padding: '0.0625rem 0.5rem',
  borderRadius: 'var(--radius-full)',
  color: inUse ? 'var(--color-success)' : 'var(--color-text-muted)',
  background: inUse ? 'var(--color-success-bg)' : 'var(--color-bg-subtle)',
  border: `1px solid ${inUse ? 'var(--color-success-border)' : 'var(--color-border)'}`,
})
