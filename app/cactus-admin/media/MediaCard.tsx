'use client'

import { type CSSProperties, type DragEvent, type MouseEvent, useState } from 'react'
import { formatBytes, filenameOf, fileKind } from './format'

export type MediaCardItem = {
  id: string
  key: string
  url: string
  altText: string | null
  isDecorative: boolean
  originalName: string | null
  mimeType: string
  sizeBytes: number
  createdAt: Date | string
  inUse: boolean
  optimised: boolean
  uploadedBy: { username: string } | null
}

// A single grid tile. The thumbnail opens the detail panel, the checkbox selects,
// right-click gives the full action menu - and on hover a small toolbar surfaces
// the most-wanted quick actions (Optimise, Replace, Copy link) so they aren't
// hidden behind a right-click.
export default function MediaCard({
  item,
  selected = false,
  selectionActive = false,
  onToggleSelect,
  onOpen,
  draggable = false,
  onDragStart,
  onDragEnd,
  onContextMenu,
  onOptimise,
  onReplace,
  onCopyLink,
  optimisable = false,
  optimising = false,
  replaceable = false,
  replacing = false,
  tags,
  dimmed = false,
}: {
  item: MediaCardItem
  selected?: boolean
  /** True when a selection exists, so every card shows its checkbox, not just on hover. */
  selectionActive?: boolean
  onToggleSelect?: (id: string, shiftKey: boolean) => void
  onOpen: (id: string) => void
  draggable?: boolean
  onDragStart?: (e: DragEvent, id: string) => void
  onDragEnd?: () => void
  onContextMenu?: (e: MouseEvent, id: string) => void
  /** Quick-optimise this item. Absent when the viewer can't upload. */
  onOptimise?: (id: string) => void
  /** Pick a fresh file to take this item's place. Absent when the viewer can't upload. */
  onReplace?: (id: string) => void
  /** Copy the item's URL to the clipboard. */
  onCopyLink?: (item: MediaCardItem) => void
  /** True when this item can still be optimised (raster, not SVG, not already done). */
  optimisable?: boolean
  /** True while this item's optimise is in flight. */
  optimising?: boolean
  /** True when this item's file is a type the library can accept a replacement for. */
  replaceable?: boolean
  /** True while this item's replacement is uploading. */
  replacing?: boolean
  tags?: string[]
  /** Faded appearance - used while the item sits on the cut clipboard. */
  dimmed?: boolean
}) {
  const isImage = item.mimeType.startsWith('image/')
  const filename = filenameOf(item)
  const showOptimise = !!onOptimise && optimisable
  const showReplace = !!onReplace && replaceable
  const showCopy = !!onCopyLink
  const [broken, setBroken] = useState(false)
  // An image that isn't flagged decorative and carries no alt text is an
  // accessibility/SEO gap - flag it on the tile so it's fixable at a glance.
  const missingAlt = isImage && item.mimeType !== 'image/svg+xml' && !item.isDecorative && !item.altText?.trim()

  return (
    <div
      className="media-card"
      draggable={draggable}
      onDragStart={draggable ? (e) => onDragStart?.(e, item.id) : undefined}
      onDragEnd={draggable ? () => onDragEnd?.() : undefined}
      onContextMenu={onContextMenu ? (e) => onContextMenu(e, item.id) : undefined}
      style={{
        position: 'relative',
        border: `1px solid ${selected ? 'var(--color-primary)' : 'var(--color-border)'}`,
        boxShadow: selected ? '0 0 0 1px var(--color-primary)' : 'var(--shadow-sm)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        background: 'var(--color-surface)',
        opacity: dimmed ? 0.5 : 1,
        cursor: draggable ? 'grab' : 'default',
      }}
    >
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => onOpen(item.id)}
          aria-label={`Open ${filename}`}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', aspectRatio: '4 / 3', padding: 0, border: 'none', background: 'var(--color-bg-subtle)', cursor: 'zoom-in', overflow: 'hidden' }}
        >
          {isImage && !broken ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={item.url} alt={item.altText ?? ''} loading="lazy" onError={() => setBroken(true)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <span style={{ fontSize: '2.25rem' }} title={broken ? 'Preview unavailable' : undefined}>{broken ? '🚫' : '📄'}</span>
          )}
        </button>

        {item.optimised && (
          <span title="Re-encoded to WebP to save space" style={cornerBadge('left')}>✓ Optimised</span>
        )}

        {missingAlt && (
          <span title="No alt text - add some for accessibility and SEO" aria-label="Missing alt text" style={altBadge}>Alt?</span>
        )}

        {(showOptimise || showReplace || showCopy) && (
          <div className="media-card__actions" style={hoverActions}>
            {showOptimise && (
              <button
                type="button"
                title="Optimise (re-encode to WebP)"
                aria-label={`Optimise ${filename}`}
                disabled={optimising}
                onClick={(e) => { e.stopPropagation(); onOptimise?.(item.id) }}
                style={actionBtn}
              >
                {optimising ? '…' : '⚡'}
              </button>
            )}
            {showReplace && (
              <button
                type="button"
                title="Replace with another file"
                aria-label={`Replace ${filename}`}
                disabled={replacing}
                onClick={(e) => { e.stopPropagation(); onReplace?.(item.id) }}
                style={actionBtn}
              >
                {replacing ? '…' : '🔄'}
              </button>
            )}
            {showCopy && (
              <button
                type="button"
                title="Copy link"
                aria-label={`Copy link to ${filename}`}
                onClick={(e) => { e.stopPropagation(); onCopyLink?.(item) }}
                style={actionBtn}
              >
                🔗
              </button>
            )}
          </div>
        )}

        {onToggleSelect && (
          <label
            className="media-card__check"
            onClick={(e) => e.stopPropagation()}
            aria-label={selected ? `Deselect ${filename}` : `Select ${filename}`}
            style={{
              position: 'absolute',
              top: '0.4rem',
              right: '0.4rem',
              width: '1.4rem',
              height: '1.4rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-sm)',
              background: selected ? 'var(--color-primary)' : 'rgba(0, 0, 0, 0.45)',
              cursor: 'pointer',
              opacity: selected || selectionActive ? 1 : 0,
              transition: 'opacity var(--dur-fast)',
            }}
          >
            <input
              type="checkbox"
              checked={selected}
              onClick={(e) => onToggleSelect(item.id, e.shiftKey)}
              onChange={() => {}}
              style={{ width: '1rem', height: '1rem', margin: 0, cursor: 'pointer', appearance: 'auto' }}
            />
          </label>
        )}
      </div>

      <div style={{ padding: '0.55rem 0.625rem 0.7rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', overflow: 'hidden' }}>
          <span style={{ flex: 1, fontSize: '0.8125rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {filename}
          </span>
          <span title={item.inUse ? 'Referenced somewhere on the site' : 'Not referenced anywhere'} style={usageDot(item.inUse)} />
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '0.15rem' }}>
          {fileKind(item.mimeType)} · {formatBytes(item.sizeBytes)}
        </div>
        {tags && tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.4rem' }}>
            {tags.slice(0, 3).map((t) => (
              <span key={t} style={tagChip}>{t}</span>
            ))}
            {tags.length > 3 && <span style={{ ...tagChip, borderStyle: 'dashed' }}>+{tags.length - 3}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

const hoverActions: CSSProperties = {
  position: 'absolute',
  bottom: '0.4rem',
  left: '0.4rem',
  display: 'inline-flex',
  gap: '0.25rem',
}

const actionBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '1.75rem',
  height: '1.75rem',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  background: 'rgba(0, 0, 0, 0.55)',
  color: '#fff',
  cursor: 'pointer',
  fontSize: '0.85rem',
  lineHeight: 1,
}

const altBadge: CSSProperties = {
  position: 'absolute',
  bottom: '0.4rem',
  right: '0.4rem',
  fontSize: '0.625rem',
  fontWeight: 700,
  padding: '0.0625rem 0.375rem',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--color-warning)',
  background: 'var(--color-warning-bg)',
  border: '1px solid var(--color-warning-border)',
}

const cornerBadge = (side: 'left' | 'right'): CSSProperties => ({
  position: 'absolute',
  top: '0.4rem',
  [side]: '0.4rem',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
  fontSize: '0.6875rem',
  fontWeight: 600,
  padding: '0.0625rem 0.375rem',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--color-success)',
  background: 'var(--color-success-bg)',
  border: '1px solid var(--color-success-border)',
})

const usageDot = (inUse: boolean): CSSProperties => ({
  flexShrink: 0,
  width: '0.5rem',
  height: '0.5rem',
  borderRadius: 'var(--radius-full)',
  background: inUse ? 'var(--color-success)' : 'var(--color-text-disabled)',
})

const tagChip: CSSProperties = { fontSize: '0.6875rem', padding: '0.0625rem 0.375rem', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }
