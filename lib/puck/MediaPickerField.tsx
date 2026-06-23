'use client'

import { useState, useEffect } from 'react'
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

  useEffect(() => {
    fetch('/api/admin/media?perPage=50')
      .then((r) => r.json())
      .then((d) => { setItems(d.items ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

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
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#fff', borderRadius: 8, width: '90vw', maxWidth: 800,
        maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)',
      }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e5e7eb', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, flexShrink: 0 }}>Select image</h3>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            autoFocus
            style={{ flex: 1, padding: '0.375rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.875rem', fontFamily: 'inherit' }}
          />
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: '#6b7280', lineHeight: 1, flexShrink: 0 }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: '1rem', overflowY: 'auto', flex: 1 }}>
          {loading && <p style={{ color: '#6b7280', textAlign: 'center' }}>Loading…</p>}
          {!loading && filtered.filter((i) => i.mimeType.startsWith('image/')).length === 0 && (
            <p style={{ color: '#9ca3af', textAlign: 'center' }}>No images found</p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
            {filtered.filter((i) => i.mimeType.startsWith('image/')).map((item) => (
              <button
                key={item.id}
                onClick={() => onSelect(item)}
                style={{
                  border: '2px solid #e5e7eb', borderRadius: 6, background: '#f9fafb',
                  cursor: 'pointer', padding: 0, overflow: 'hidden', textAlign: 'left',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.url}
                  alt={item.altText ?? ''}
                  style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }}
                />
                <div style={{ padding: '0.375rem 0.5rem', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#4b5563' }}>
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

  useEffect(() => {
    if (!value) { setPreview(null); return }
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
      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>
        {(field as { label?: string }).label ?? 'OG image'}
      </label>
      {preview && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={preview}
          alt=""
          style={{ width: '100%', maxHeight: 100, objectFit: 'cover', borderRadius: 4, marginBottom: '0.5rem', display: 'block', border: '1px solid #e5e7eb' }}
        />
      )}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{ padding: '0.375rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'inherit' }}
        >
          {value ? 'Change image' : 'Select image'}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => { onChange(''); setPreview(null) }}
            style={{ padding: '0.375rem 0.75rem', border: '1px solid #fca5a5', borderRadius: 6, background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'inherit' }}
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
      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>
        {(field as { label?: string }).label ?? 'Image'}
      </label>
      {value && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={value}
          alt=""
          style={{ width: '100%', maxHeight: 100, objectFit: 'cover', borderRadius: 4, marginBottom: '0.5rem', display: 'block', border: '1px solid #e5e7eb' }}
        />
      )}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{ padding: '0.375rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'inherit' }}
        >
          {value ? 'Change image' : 'Select image'}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            style={{ padding: '0.375rem 0.75rem', border: '1px solid #fca5a5', borderRadius: 6, background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'inherit' }}
          >
            Remove
          </button>
        )}
      </div>
      {open && <MediaPickerModal onSelect={handleSelect} onClose={() => setOpen(false)} />}
    </div>
  )
}
