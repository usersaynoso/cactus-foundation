'use client'

import { useState, useEffect, useRef } from 'react'
import type { CustomFieldRender } from '@puckeditor/core'

type MediaItem = {
  id: string
  url: string
  key: string
  altText: string | null
  mimeType: string
}

function MediaPickerModal({ onSelect, onClose }: {
  onSelect: (item: MediaItem) => void
  onClose: () => void
}) {
  const [items, setItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/admin/media?perPage=50')
      .then((r) => r.json())
      .then((d) => { setItems(d.items ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function handleUpload(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError('')
    const fd = new FormData()
    fd.append('file', file)
    fd.append('altText', '')
    try {
      const res = await fetch('/api/admin/media', { method: 'POST', body: fd })
      const record = await res.json()
      if (!res.ok) throw new Error(record.error ?? 'Upload failed')
      const item: MediaItem = {
        id: record.id, url: record.url, key: record.key,
        altText: record.altText ?? null, mimeType: record.mimeType,
      }
      setItems((prev) => [item, ...prev])
      onSelect(item)
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
      setUploading(false)
    }
  }

  const filtered = query
    ? items.filter((i) =>
        i.key.toLowerCase().includes(query.toLowerCase()) ||
        (i.altText ?? '').toLowerCase().includes(query.toLowerCase())
      )
    : items

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'var(--color-overlay)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'var(--color-surface)', borderRadius: 8, width: '90vw', maxWidth: 800,
        maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)',
      }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, flexShrink: 0 }}>Select image</h3>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            autoFocus
            style={{ flex: 1, padding: '0.375rem 0.75rem', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: '0.875rem', fontFamily: 'inherit', background: 'var(--color-bg)', color: 'var(--color-text)' }}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            style={{ display: 'none' }}
            onChange={(e) => handleUpload(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{ flexShrink: 0, padding: '0.375rem 0.75rem', border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-surface)', cursor: uploading ? 'default' : 'pointer', fontSize: '0.8125rem', fontFamily: 'inherit', color: 'var(--color-text)', opacity: uploading ? 0.6 : 1 }}
          >
            {uploading ? 'Uploading…' : '+ Upload'}
          </button>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--color-text-muted)', lineHeight: 1, flexShrink: 0 }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: '1rem', overflowY: 'auto', flex: 1 }}>
          {uploadError && <p style={{ color: 'var(--color-destructive)', textAlign: 'center', fontSize: '0.8125rem', marginTop: 0 }}>{uploadError}</p>}
          {loading && <p style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>Loading…</p>}
          {!loading && filtered.filter((i) => i.mimeType.startsWith('image/')).length === 0 && (
            <p style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>No images found</p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
            {filtered.filter((i) => i.mimeType.startsWith('image/')).map((item) => (
              <button
                key={item.id}
                onClick={() => onSelect(item)}
                style={{
                  border: '2px solid var(--color-border)', borderRadius: 6, background: 'var(--color-bg-subtle)',
                  cursor: 'pointer', padding: 0, overflow: 'hidden', textAlign: 'left',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.url}
                  alt={item.altText ?? ''}
                  style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }}
                />
                <div style={{ padding: '0.375rem 0.5rem', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}>
                  {item.key.split('/').pop()}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// For the Puck root ogImageId field — stores Media.id only.
// The public metadata generation looks up the URL server-side.
export const OgImagePickerField: CustomFieldRender<string> = ({ value, onChange, field }) => {
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const displayPreview = value ? preview : null

  useEffect(() => {
    if (!value) return
    fetch(`/api/admin/media?id=${value}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d?.items?.[0] && setPreview(d.items[0].url))
      .catch(() => null)
  }, [value])

  function handleSelect(item: MediaItem) {
    onChange(item.id)
    setPreview(item.url)
    setOpen(false)
  }

  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text)', marginBottom: '0.375rem' }}>
        {(field as { label?: string }).label ?? 'OG image'}
      </label>
      {displayPreview && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={displayPreview ?? ''}
          alt=""
          style={{ width: '100%', maxHeight: 100, objectFit: 'cover', borderRadius: 4, marginBottom: '0.5rem', display: 'block', border: '1px solid var(--color-border)' }}
        />
      )}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{ padding: '0.375rem 0.75rem', border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-surface)', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'inherit' }}
        >
          {value ? 'Change image' : 'Select image'}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => { onChange(''); setPreview(null) }}
            style={{ padding: '0.375rem 0.75rem', border: '1px solid var(--color-destructive-border)', borderRadius: 6, background: 'var(--color-surface)', color: 'var(--color-destructive)', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'inherit' }}
          >
            Remove
          </button>
        )}
      </div>
      {open && <MediaPickerModal onSelect={handleSelect} onClose={() => setOpen(false)} />}
    </div>
  )
}

// For ImageBlock.mediaUrl field — stores the Worker URL directly so the server
// render can display the image without a DB lookup.
export const ImageUrlPickerField: CustomFieldRender<string> = ({ value, onChange, field }) => {
  const [open, setOpen] = useState(false)

  function handleSelect(item: MediaItem) {
    onChange(item.url)
    setOpen(false)
  }

  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text)', marginBottom: '0.375rem' }}>
        {(field as { label?: string }).label ?? 'Image'}
      </label>
      {value && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={value}
          alt=""
          style={{ width: '100%', maxHeight: 100, objectFit: 'cover', borderRadius: 4, marginBottom: '0.5rem', display: 'block', border: '1px solid var(--color-border)' }}
        />
      )}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{ padding: '0.375rem 0.75rem', border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-surface)', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'inherit' }}
        >
          {value ? 'Change image' : 'Select image'}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            style={{ padding: '0.375rem 0.75rem', border: '1px solid var(--color-destructive-border)', borderRadius: 6, background: 'var(--color-surface)', color: 'var(--color-destructive)', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'inherit' }}
          >
            Remove
          </button>
        )}
      </div>
      {open && <MediaPickerModal onSelect={handleSelect} onClose={() => setOpen(false)} />}
    </div>
  )
}
