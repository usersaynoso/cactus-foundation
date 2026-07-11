'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

export default function MediaUpload({
  folderId = null,
  onUploaded,
}: {
  /** Folder new uploads land in. Null = the library root. */
  folderId?: string | null
  /** Called after a batch finishes, so a parent can refresh without a full reload. */
  onUploaded?: () => void
} = {}) {
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setError('')

    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('altText', '')
      if (folderId) fd.append('folderId', folderId)

      try {
        const res = await fetch('/api/admin/media', { method: 'POST', body: fd })
        if (!res.ok) {
          const d = await res.json()
          throw new Error(d.error ?? 'Upload failed')
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Upload failed')
      }
    }

    setUploading(false)
    if (onUploaded) onUploaded()
    else router.refresh()
  }

  return (
    <div>
      {error && <span style={{ color: 'var(--color-destructive)', fontSize: 'var(--text-base)', marginRight: 'var(--space-3)' }}>{error}</span>}
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />
      <button
        className="btn btn-primary"
        disabled={uploading}
        onClick={() => ref.current?.click()}
      >
        {uploading ? 'Uploading…' : '+ Upload'}
      </button>
    </div>
  )
}
