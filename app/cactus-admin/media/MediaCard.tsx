'use client'

import { type CSSProperties } from 'react'
import MediaDelete from './MediaDelete'

export type MediaCardItem = {
  id: string
  key: string
  url: string
  altText: string | null
  originalName: string | null
  mimeType: string
  sizeBytes: number
  createdAt: Date | string
  inUse: boolean
  uploadedBy: { username: string } | null
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

const badgeStyle = (inUse: boolean): CSSProperties => ({
  flexShrink: 0,
  fontSize: '0.6875rem',
  fontWeight: 500,
  padding: '0.0625rem 0.375rem',
  borderRadius: 'var(--radius-sm)',
  color: inUse ? 'var(--color-success)' : 'var(--color-text-muted)',
  background: inUse ? 'var(--color-success-bg)' : 'var(--color-bg-subtle)',
  border: `1px solid ${inUse ? 'var(--color-success-border)' : 'var(--color-border)'}`,
})

export default function MediaCard({
  item,
  canDelete,
  selectable = false,
  selected = false,
  onToggleSelect,
  onOpen,
}: {
  item: MediaCardItem
  canDelete: boolean
  /** Show the bulk-select checkbox overlay (only meaningful alongside a delete permission). */
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: (id: string, shiftKey: boolean) => void
  onOpen: (id: string) => void
}) {
  const isImage = item.mimeType.startsWith('image/')
  const filename = item.originalName || item.key.split('/').pop()

  return (
    <>
      <div style={{ border: `1px solid ${selected ? 'var(--color-primary)' : 'var(--color-border)'}`, borderRadius: 'var(--radius)', overflow: 'hidden', background: 'var(--color-bg-subtle)' }}>
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => onOpen(item.id)}
            aria-label={`Open ${filename ?? 'media item'}`}
            style={{ display: 'block', width: '100%', height: 140, padding: 0, border: 'none', background: 'var(--color-bg-subtle)', cursor: 'zoom-in', overflow: 'hidden' }}
          >
            {isImage ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={item.url} alt={item.altText ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            ) : (
              <span style={{ fontSize: '2rem' }}>📄</span>
            )}
          </button>
          {selectable && (
            <label
              onClick={(e) => e.stopPropagation()}
              aria-label={selected ? `Deselect ${filename ?? 'media item'}` : `Select ${filename ?? 'media item'}`}
              style={{
                position: 'absolute',
                top: '0.4rem',
                right: '0.4rem',
                width: '1.35rem',
                height: '1.35rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--radius-sm)',
                background: selected ? 'var(--color-primary)' : 'rgba(0, 0, 0, 0.45)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={selected}
                onClick={(e) => onToggleSelect?.(item.id, e.shiftKey)}
                onChange={() => {}}
                style={{ width: '1rem', height: '1rem', margin: 0, cursor: 'pointer', border: 'none', outline: 'none', appearance: 'auto' }}
              />
            </label>
          )}
        </div>
        <div style={{ padding: '0.625rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', overflow: 'hidden' }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {filename}
            </div>
            <span title={item.inUse ? 'Referenced somewhere on the site' : 'Not referenced anywhere'} style={{ ...badgeStyle(item.inUse), marginLeft: 'auto' }}>
              {item.inUse ? 'In use' : 'Unused'}
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            {formatBytes(item.sizeBytes)}
          </div>
          {canDelete && <MediaDelete mediaId={item.id} mediaUrl={item.url} />}
        </div>
      </div>
    </>
  )
}
