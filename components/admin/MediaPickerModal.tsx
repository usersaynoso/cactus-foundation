'use client'

import { useState, useEffect, useRef } from 'react'

// The media picker every admin screen opens: Puck's image and video fields, the SEO
// tab, and anything else that needs "pick something from storage".
//
// Two views:
//   - mode 'file' (the default) picks a library item, browsing the media library's
//     own folders. `kind` narrows it to images or videos, or 'all' for every file.
//   - mode 'folder' picks a FOLDER in the site's bucket, walking the bucket itself one
//     level at a time (GET /api/admin/media/storage), so every folder and file shows,
//     not only the ones the library has a row for. That is how the backup screen picks
//     where database backups go: they live beside the library, never inside it.

export type MediaKind = 'image' | 'video' | 'all'

export type MediaItem = {
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

function LibraryPicker({ onSelect, onClose, kind = 'image' }: {
  onSelect: (item: MediaItem) => void
  onClose: () => void
  kind?: MediaKind
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
    const params = new URLSearchParams({ perPage: '50', type: kind === 'image' ? 'image' : kind === 'all' ? 'all' : 'other' })
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

  const filtered = kind === 'all'
    ? items
    : kind === 'video'
      ? items.filter((i) => i.mimeType.startsWith('video/'))
      : items.filter((i) => i.mimeType.startsWith('image/'))

  const kindNoun = kind === 'video' ? 'video' : kind === 'all' ? 'file' : 'image'

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
                accept={kind === 'video' ? 'video/mp4,video/webm,video/quicktime' : kind === 'all' ? undefined : 'image/jpeg,image/png,image/webp,image/gif,image/svg+xml'}
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
                {kind === 'all' && !item.mimeType.startsWith('image/') ? (
                  <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                    {(item.key.split('.').pop() ?? 'file').slice(0, 6)}
                  </div>
                ) : kind === 'video' ? (
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


type StorageListing = {
  bucket: string
  prefix: string
  folders: Array<{ name: string; prefix: string }>
  files: Array<{ name: string; key: string; sizeBytes: number; lastModified: string | null }>
  truncated: boolean
  publicPrefix: string
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

const FOLDER_NAME = /^[A-Za-z0-9_.-]+$/

function isUnder(prefix: string, area: string): boolean {
  return prefix === area || prefix.startsWith(`${area}/`)
}

function StorageFolderPicker({ onChoose, onClose, initialFolder = '', title = 'Choose a folder', chooseLabel = 'Use this folder', refusePublic = false }: {
  onChoose: (folder: string) => void
  onClose: () => void
  initialFolder?: string
  title?: string
  chooseLabel?: string
  /** Refuse the publicly served part of the bucket, and its top level. */
  refusePublic?: boolean
}) {
  const [prefix, setPrefix] = useState(initialFolder.replace(/^\/+|\/+$/g, ''))
  const [listing, setListing] = useState<StorageListing | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newName, setNewName] = useState('')
  const [naming, setNaming] = useState(false)

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      if (cancelled) return
      setLoading(true)
      setError('')
      fetch(`/api/admin/media/storage?prefix=${encodeURIComponent(prefix)}`)
        .then(async (r) => {
          const data = await r.json()
          if (!r.ok) throw new Error(data.error ?? 'Could not open that folder')
          return data as StorageListing
        })
        .then((data) => { if (!cancelled) { setListing(data); setLoading(false) } })
        .catch((err: unknown) => { if (!cancelled) { setError(err instanceof Error ? err.message : 'Could not open that folder'); setLoading(false) } })
    }, 0)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [prefix])

  const segments = prefix ? prefix.split('/') : []
  const publicArea = listing?.publicPrefix ?? 'media'
  const inPublic = isUnder(prefix, publicArea)
  const refusal = !refusePublic
    ? ''
    : !prefix
      ? 'Open or make a folder: backups are not kept loose at the top of the bucket.'
      : inPublic
        ? `Everything under "${publicArea}" is shown to the public, so backups cannot go here.`
        : ''

  function openNewFolder() {
    const name = newName.trim()
    if (!FOLDER_NAME.test(name)) return
    setPrefix(prefix ? `${prefix}/${name}` : name)
    setNewName('')
    setNaming(false)
  }

  const linkButton = (current: boolean) => ({
    background: 'none', border: 'none', padding: '0.125rem 0.25rem', fontFamily: 'inherit', fontSize: 'inherit',
    cursor: current ? 'default' : 'pointer', color: current ? 'var(--color-text)' : 'var(--color-link)',
  })

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'var(--color-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ background: 'var(--color-surface)', borderRadius: 8, width: '90vw', maxWidth: 800, maxHeight: '80vh', display: 'flex', flexDirection: 'column', border: '1px solid var(--color-border)' }}
      >
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, flex: 1 }}>{title}</h3>
          {naming ? (
            <span style={{ display: 'inline-flex', gap: '0.375rem' }}>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') openNewFolder(); if (e.key === 'Escape') setNaming(false) }}
                placeholder="Folder name"
                aria-label="New folder name"
                autoFocus
                style={{ padding: '0.375rem 0.75rem', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: '0.8125rem', fontFamily: 'inherit', background: 'var(--color-bg)', color: 'var(--color-text)' }}
              />
              <button type="button" className="btn btn-secondary btn-sm" disabled={!FOLDER_NAME.test(newName.trim())} onClick={openNewFolder}>Open</button>
            </span>
          ) : (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setNaming(true)}>+ New folder</button>
          )}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--color-text-muted)', lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '0.625rem 1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', flexWrap: 'wrap', gap: '0.25rem', alignItems: 'center', fontSize: '0.8125rem' }}>
          <button type="button" onClick={() => setPrefix('')} style={linkButton(prefix === '')}>
            {listing?.bucket ?? 'Bucket'}
          </button>
          {segments.map((name, idx) => {
            const target = segments.slice(0, idx + 1).join('/')
            return (
              <span key={target} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>/</span>
                <button type="button" onClick={() => setPrefix(target)} style={linkButton(idx === segments.length - 1)}>{name}</button>
              </span>
            )
          })}
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading && <p style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>Loading…</p>}
          {!loading && error && <p style={{ color: 'var(--color-destructive)', textAlign: 'center', fontSize: '0.8125rem' }}>{error}</p>}
          {!loading && !error && listing && listing.folders.length === 0 && listing.files.length === 0 && (
            <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', fontSize: '0.875rem' }}>
              {prefix ? 'Nothing in here yet. A new folder appears in your storage once something is saved in it.' : 'This bucket is empty.'}
            </p>
          )}
          {!loading && !error && listing && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {listing.folders.map((f) => (
                <li key={f.prefix} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <button
                    type="button"
                    onClick={() => setPrefix(f.prefix)}
                    style={{ width: '100%', display: 'flex', gap: '0.625rem', alignItems: 'center', padding: '0.5rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', fontSize: '0.875rem', color: 'var(--color-text)' }}
                  >
                    <span aria-hidden="true">📁</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    {refusePublic && isUnder(f.prefix, publicArea) && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>public</span>
                    )}
                  </button>
                </li>
              ))}
              {listing.files.map((file) => (
                <li
                  key={file.key}
                  style={{ display: 'flex', gap: '0.625rem', alignItems: 'center', padding: '0.5rem 1.25rem', borderBottom: '1px solid var(--color-border)', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}
                >
                  <span aria-hidden="true">📄</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                  <span style={{ color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{formatBytes(file.sizeBytes)}</span>
                  {file.lastModified && (
                    <span style={{ color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{new Date(file.lastModified).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!loading && listing?.truncated && (
            <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', fontSize: '0.75rem' }}>Showing the first 1,000 files in this folder.</p>
          )}
        </div>

        <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--color-border)', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: '0.8125rem', color: refusal ? 'var(--color-text-muted)' : 'var(--color-text-secondary)' }}>
            {refusal || <>Folder: <code>{prefix || '/'}</code></>}
          </span>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!!refusal || !!error} onClick={() => onChoose(prefix)}>{chooseLabel}</button>
        </div>
      </div>
    </div>
  )
}

type FilePickerProps = {
  mode?: 'file'
  onSelect: (item: MediaItem) => void
  onClose: () => void
  kind?: MediaKind
}

type FolderPickerProps = {
  mode: 'folder'
  onChoose: (folder: string) => void
  onClose: () => void
  initialFolder?: string
  title?: string
  chooseLabel?: string
  refusePublic?: boolean
}

export function MediaPickerModal(props: FilePickerProps | FolderPickerProps) {
  if (props.mode === 'folder') {
    return (
      <StorageFolderPicker
        onChoose={props.onChoose}
        onClose={props.onClose}
        initialFolder={props.initialFolder}
        title={props.title}
        chooseLabel={props.chooseLabel}
        refusePublic={props.refusePublic}
      />
    )
  }
  return <LibraryPicker onSelect={props.onSelect} onClose={props.onClose} kind={props.kind} />
}
