'use client'

import { useState, useEffect, useRef } from 'react'
import type { CustomFieldRender } from '@puckeditor/core'

type MediaItem = {
  id: string
  url: string
  key: string
  altText: string | null
  originalName: string | null
  mimeType: string
}

type Folder = {
  id: string
  name: string
  parentId: string | null
  mediaCount: number
}

function MediaPickerModal({ onSelect, onClose, kind = 'image' }: {
  onSelect: (item: MediaItem) => void
  onClose: () => void
  kind?: 'image' | 'video'
}) {
  const [items, setItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [folders, setFolders] = useState<Folder[]>([])
  // null = library root. When searching we ignore this and span every folder.
  const [folderId, setFolderId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Folder tree, once. The picker assembles the current level from parentId.
  useEffect(() => {
    fetch('/api/admin/media/folders')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d?.folders && setFolders(d.folders))
      .catch(() => null)
  }, [])

  // Media scoped to the current folder, or spanning every folder while searching.
  // Debounced so typing doesn't hammer the endpoint on each keystroke.
  const trimmed = query.trim()
  useEffect(() => {
    let cancelled = false
    // The library has no dedicated "sequence" or "video" server filter (only
    // all/image/other), so both are fetched as "other" (non-image) and narrowed
    // client-side by the mime checks below.
    const params = new URLSearchParams({ perPage: '50', type: kind === 'image' ? 'image' : 'other' })
    if (trimmed) {
      params.set('folder', 'all')
      params.set('q', trimmed)
    } else {
      params.set('folder', folderId ?? 'root')
    }
    const timer = setTimeout(() => {
      if (!cancelled) setLoading(true)
      fetch(`/api/admin/media?${params.toString()}`)
        .then((r) => r.json())
        .then((d) => { if (!cancelled) { setItems(d.items ?? []); setLoading(false) } })
        .catch(() => { if (!cancelled) setLoading(false) })
    }, trimmed ? 250 : 0)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [folderId, trimmed, kind])

  // Subfolders of the current level, hidden while searching (search spans all).
  const subfolders = trimmed ? [] : folders.filter((f) => f.parentId === folderId)

  // Breadcrumb trail from root down to the current folder.
  const breadcrumb: Folder[] = []
  if (!trimmed) {
    const byId = new Map(folders.map((f) => [f.id, f]))
    let cur = folderId ? byId.get(folderId) : undefined
    while (cur) {
      breadcrumb.unshift(cur)
      cur = cur.parentId ? byId.get(cur.parentId) : undefined
    }
  }

  async function handleUpload(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError('')
    const fd = new FormData()
    fd.append('file', file)
    fd.append('altText', '')
    if (folderId) fd.append('folderId', folderId)
    try {
      const res = await fetch('/api/admin/media', { method: 'POST', body: fd })
      const record = await res.json()
      if (!res.ok) throw new Error(record.error ?? 'Upload failed')
      const item: MediaItem = {
        id: record.id, url: record.url, key: record.key,
        altText: record.altText ?? null, originalName: record.originalName ?? null,
        mimeType: record.mimeType,
      }
      setItems((prev) => [item, ...prev])
      onSelect(item)
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
      setUploading(false)
    }
  }

  const filtered = kind === 'video'
    ? items.filter((i) => i.mimeType.startsWith('video/'))
    : items.filter((i) => i.mimeType.startsWith('image/'))

  const kindNoun = kind === 'video' ? 'video' : 'image'

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
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, flexShrink: 0 }}>Select {kindNoun}</h3>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            autoFocus
            style={{ flex: 1, padding: '0.375rem 0.75rem', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: '0.875rem', fontFamily: 'inherit', background: 'var(--color-bg)', color: 'var(--color-text)' }}
          />
          <>
              <input
                ref={fileRef}
                type="file"
                // SVG joins the image list for icon-sized artwork (IconLink); the
                // server's ACCEPTED_UPLOAD_TYPES has taken it all along — this
                // attribute was the only thing filtering it out.
                accept={kind === 'video' ? 'video/mp4,video/webm,video/quicktime' : 'image/jpeg,image/png,image/webp,image/gif,image/svg+xml'}
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
          </>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--color-text-muted)', lineHeight: 1, flexShrink: 0 }}
          >
            ×
          </button>
        </div>
        {!trimmed && (
          <div style={{ padding: '0.625rem 1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', flexWrap: 'wrap', gap: '0.25rem', alignItems: 'center', fontSize: '0.8125rem' }}>
            <button
              type="button"
              onClick={() => setFolderId(null)}
              style={{ background: 'none', border: 'none', padding: '0.125rem 0.25rem', cursor: folderId === null ? 'default' : 'pointer', color: folderId === null ? 'var(--color-text)' : 'var(--color-link)', fontFamily: 'inherit', fontSize: 'inherit' }}
            >
              Media
            </button>
            {breadcrumb.map((f, idx) => (
              <span key={f.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>/</span>
                <button
                  type="button"
                  onClick={() => setFolderId(f.id)}
                  style={{ background: 'none', border: 'none', padding: '0.125rem 0.25rem', cursor: idx === breadcrumb.length - 1 ? 'default' : 'pointer', color: idx === breadcrumb.length - 1 ? 'var(--color-text)' : 'var(--color-link)', fontFamily: 'inherit', fontSize: 'inherit' }}
                >
                  {f.name}
                </button>
              </span>
            ))}
          </div>
        )}
        <div style={{ padding: '1rem', overflowY: 'auto', flex: 1 }}>
          {uploadError && <p style={{ color: 'var(--color-destructive)', textAlign: 'center', fontSize: '0.8125rem', marginTop: 0 }}>{uploadError}</p>}
          {loading && <p style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>Loading…</p>}
          {!loading && subfolders.length === 0 && filtered.length === 0 && (
            <p style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>{trimmed ? `No ${kindNoun}s found` : 'This folder is empty'}</p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
            {subfolders.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFolderId(f.id)}
                style={{
                  border: '2px solid var(--color-border)', borderRadius: 6, background: 'var(--color-bg-subtle)',
                  cursor: 'pointer', padding: 0, overflow: 'hidden', textAlign: 'left',
                }}
              >
                <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', color: 'var(--color-text-muted)' }}>
                  📁
                </div>
                <div style={{ padding: '0.375rem 0.5rem', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}>
                  {f.name}{f.mediaCount ? ` (${f.mediaCount})` : ''}
                </div>
              </button>
            ))}
            {filtered.map((item) => (
              <button
                key={item.id}
                onClick={() => onSelect(item)}
                style={{
                  border: '2px solid var(--color-border)', borderRadius: 6, background: 'var(--color-bg-subtle)',
                  cursor: 'pointer', padding: 0, overflow: 'hidden', textAlign: 'left',
                }}
              >
                {/* A video has no still to point at, so the browser's own first
                    frame is the thumbnail (metadata only - the tile must not
                    pull megabytes per item). */}
                {kind === 'video' ? (
                  <video
                    src={item.url}
                    preload="metadata"
                    muted
                    playsInline
                    style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block', background: 'var(--color-bg-subtle)' }}
                  />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={item.url}
                    alt={item.altText ?? ''}
                    style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }}
                  />
                )}
                <div style={{ padding: '0.375rem 0.5rem', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}>
                  {item.originalName || item.key.split('/').pop()}
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

// Every block field that holds an image URL, keyed by component then field, with
// the label to show in the editor. The picker stores the Worker URL directly so
// the server render can display the image without a DB lookup. Both Puck editors
// run their config through `withImagePickerFields` so adding a new image field
// here is all that's needed — no per-editor wiring to keep in sync.
const IMAGE_PICKER_FIELDS: Record<string, Record<string, string>> = {
  ImageBlock:     { mediaUrl: 'Image' },
  IconLink:       { iconUrl: 'Icon image (SVG or PNG)' },
  SiteLogo:       { imageUrl: 'Logo image (leave blank for the site logo)', imageUrlDark: 'Logo image in dark mode' },
  Card:           { mediaUrl: 'Image' },
  Quote:          { mediaUrl: 'Photo (shown inside the quote, left of the text)' },
  ImageChipPanel: { mediaUrl: 'Image' },
  Hero:           { bgImage: 'Background image', imageUrl: 'Side image (right-image layout)', patternImage: 'Background pattern (image or SVG)', patternImageDark: 'Background pattern in dark mode' },
  Section:        { bgImage: 'Background image', patternImage: 'Background pattern (image or SVG)', patternImageDark: 'Background pattern in dark mode' },
  CTABanner:      { patternImage: 'Background pattern (image or SVG)', patternImageDark: 'Background pattern in dark mode' },
  // Email wrapper blocks. An email cannot reach a relative path, so what these
  // store has to be the absolute media URL the picker already hands back.
  EmailLogo:      { src: 'Logo image (leave blank for the site logo)' },
  EmailImage:     { src: 'Image' },
}

// Same again for fields holding a self-hosted video URL (an mp4/webm in the
// media library, not a YouTube or Vimeo link - those stay plain text fields).
const VIDEO_PICKER_FIELDS: Record<string, Record<string, string>> = {
  FeatureVideo: { videoUrl: 'Video' },
}

// Swap every known media URL text field in a Puck config for the matching media
// picker — image fields for the image picker, video fields for the video one. Components/fields not present in the given config are skipped, so this
// is safe on the layout editor's filtered config too.
export function withImagePickerFields<C>(config: C): C {
  const cfg = config as { components?: Record<string, { fields?: Record<string, unknown> }> }
  if (!cfg?.components) return config
  const components = { ...cfg.components }
  const swap = (map: Record<string, Record<string, string>>, render: CustomFieldRender<string>) => {
    for (const [componentName, fieldLabels] of Object.entries(map)) {
      const component = components[componentName]
      if (!component?.fields) continue
      const fields = { ...component.fields }
      let changed = false
      for (const [fieldName, label] of Object.entries(fieldLabels)) {
        if (!(fieldName in fields)) continue
        fields[fieldName] = { type: 'custom' as const, label, render }
        changed = true
      }
      if (changed) components[componentName] = { ...component, fields }
    }
  }
  swap(IMAGE_PICKER_FIELDS, ImageUrlPickerField)
  swap(VIDEO_PICKER_FIELDS, VideoUrlPickerField)
  return { ...cfg, components } as C
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


// For FeatureVideo.videoUrl — the media library picker filtered to videos,
// storing the picked item's url. The preview is the video's own first frame,
// loaded metadata-only so the panel stays cheap.
export const VideoUrlPickerField: CustomFieldRender<string> = ({ value, onChange, field }) => {
  const [open, setOpen] = useState(false)

  function handleSelect(item: MediaItem) {
    onChange(item.url)
    setOpen(false)
  }

  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text)', marginBottom: '0.375rem' }}>
        {(field as { label?: string }).label ?? 'Video'}
      </label>
      {value && (
        <video
          src={value}
          preload="metadata"
          muted
          playsInline
          style={{ width: '100%', maxHeight: 100, objectFit: 'contain', borderRadius: 4, marginBottom: '0.5rem', display: 'block', border: '1px solid var(--color-border)', background: 'var(--color-bg-subtle)' }}
        />
      )}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{ padding: '0.375rem 0.75rem', border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-surface)', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'inherit' }}
        >
          {value ? 'Change video' : 'Select video'}
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
      {open && <MediaPickerModal onSelect={handleSelect} onClose={() => setOpen(false)} kind="video" />}
    </div>
  )
}
