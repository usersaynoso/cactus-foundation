'use client'

import { useEffect } from 'react'
import MediaDelete from './MediaDelete'
import type { MediaCardItem } from './MediaCard'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

const badgeStyle = (inUse: boolean) => ({
  flexShrink: 0,
  fontSize: '0.6875rem',
  fontWeight: 500,
  padding: '0.0625rem 0.375rem',
  borderRadius: 'var(--radius-sm)',
  color: inUse ? 'var(--color-success)' : 'var(--color-text-muted)',
  background: inUse ? 'var(--color-success-bg)' : 'var(--color-bg-subtle)',
  border: `1px solid ${inUse ? 'var(--color-success-border)' : 'var(--color-border)'}`,
} as const)

// Full-size viewer for a single media item, shared by the grid so Prev/Next can
// step across the currently loaded item list. Escape closes; ArrowLeft/ArrowRight
// navigate (disabled at either end - see hasPrev/hasNext from MediaGrid).
export default function MediaLightbox({
  item,
  canDelete,
  hasPrev,
  hasNext,
  loadingNext,
  onClose,
  onPrev,
  onNext,
}: {
  item: MediaCardItem
  canDelete: boolean
  hasPrev: boolean
  hasNext: boolean
  loadingNext: boolean
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}) {
  const isImage = item.mimeType.startsWith('image/')
  const filename = item.key.split('/').pop()
  const uploadedOn = new Date(item.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && hasPrev) onPrev()
      else if (e.key === 'ArrowRight' && hasNext) onNext()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose, onPrev, onNext, hasPrev, hasNext])

  const navButtonStyle = (side: 'left' | 'right') => ({
    position: 'fixed' as const,
    [side]: '1rem',
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 81,
    width: '2.75rem',
    height: '2.75rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: '50%',
    background: 'var(--color-surface)',
    color: 'var(--color-text)',
    boxShadow: 'var(--shadow-xl)',
    cursor: 'pointer',
    fontSize: '1.5rem',
    lineHeight: 1,
  })

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={filename ?? 'Media item'}
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'var(--color-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
    >
      {hasPrev && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onPrev() }} aria-label="Previous item" style={navButtonStyle('left')}>
          ‹
        </button>
      )}
      {hasNext && (
        <button type="button" disabled={loadingNext} onClick={(e) => { e.stopPropagation(); onNext() }} aria-label="Next item" style={navButtonStyle('right')}>
          ›
        </button>
      )}

      <div
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'relative', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-xl)', maxWidth: 'min(900px, 92vw)', width: '100%', maxHeight: '90vh', overflow: 'auto', display: 'flex', flexDirection: 'column' }}
      >
        <button
          type="button"
          autoFocus
          onClick={onClose}
          aria-label="Close"
          style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', zIndex: 1, width: '2rem', height: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-subtle)', color: 'var(--color-text)', cursor: 'pointer', fontSize: '1.25rem', lineHeight: 1, fontFamily: 'inherit' }}
        >
          ×
        </button>

        <div style={{ background: 'var(--color-bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', minHeight: 200, borderBottom: '1px solid var(--color-border)' }}>
          {isImage ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={item.url} alt={item.altText ?? ''} style={{ maxWidth: '100%', maxHeight: '65vh', objectFit: 'contain', display: 'block' }} />
          ) : (
            <span style={{ fontSize: '4rem' }}>📄</span>
          )}
        </div>

        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text)', wordBreak: 'break-all' }}>
              {filename}
            </h2>
            <span title={item.inUse ? 'Referenced somewhere on the site' : 'Not referenced anywhere'} style={badgeStyle(item.inUse)}>
              {item.inUse ? 'In use' : 'Unused'}
            </span>
          </div>

          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.25rem 1rem', fontSize: 'var(--text-sm)' }}>
            <dt style={{ color: 'var(--color-text-muted)' }}>Size</dt>
            <dd style={{ margin: 0, color: 'var(--color-text)' }}>{formatBytes(item.sizeBytes)}</dd>
            <dt style={{ color: 'var(--color-text-muted)' }}>Type</dt>
            <dd style={{ margin: 0, color: 'var(--color-text)' }}>{item.mimeType}</dd>
            {item.altText && (
              <>
                <dt style={{ color: 'var(--color-text-muted)' }}>Alt text</dt>
                <dd style={{ margin: 0, color: 'var(--color-text)' }}>{item.altText}</dd>
              </>
            )}
            <dt style={{ color: 'var(--color-text-muted)' }}>Uploaded</dt>
            <dd style={{ margin: 0, color: 'var(--color-text)' }}>
              {uploadedOn}{item.uploadedBy ? ` by ${item.uploadedBy.username}` : ''}
            </dd>
          </dl>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
            <a className="btn btn-secondary btn-sm" href={item.url} target="_blank" rel="noopener noreferrer">Open original ↗</a>
            {canDelete && <MediaDelete mediaId={item.id} mediaUrl={item.url} />}
          </div>
        </div>
      </div>
    </div>
  )
}
