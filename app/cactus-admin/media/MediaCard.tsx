'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import MediaDelete from './MediaDelete'

export type MediaCardItem = {
  id: string
  key: string
  url: string
  altText: string | null
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

export default function MediaCard({ item, canDelete }: { item: MediaCardItem; canDelete: boolean }) {
  const [open, setOpen] = useState(false)
  const isImage = item.mimeType.startsWith('image/')
  const filename = item.key.split('/').pop()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  const uploadedOn = new Date(item.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <>
      <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', overflow: 'hidden', background: 'var(--color-bg-subtle)' }}>
        <button
          type="button"
          onClick={() => setOpen(true)}
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

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={filename ?? 'Media item'}
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'var(--color-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ position: 'relative', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-xl)', maxWidth: 'min(900px, 92vw)', width: '100%', maxHeight: '90vh', overflow: 'auto', display: 'flex', flexDirection: 'column' }}
          >
            <button
              type="button"
              autoFocus
              onClick={() => setOpen(false)}
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
      )}
    </>
  )
}
