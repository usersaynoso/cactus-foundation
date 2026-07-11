'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// fullWidth (default) stacks a block Delete button in the grid card; the
// lightbox action row passes fullWidth={false} so it sits inline with the other
// btn-sm actions rather than dropping onto its own full-width line.
export default function MediaDelete({ mediaId, mediaUrl, fullWidth = true }: { mediaId: string; mediaUrl: string; fullWidth?: boolean }) {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleDelete() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/media/${mediaId}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Delete failed')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Delete failed')
      setLoading(false)
    }
  }

  if (error) return <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-destructive)', marginTop: 'var(--space-1)' }}>{error}</div>

  return confirm ? (
    <div style={{ marginTop: '0.375rem', display: 'flex', gap: '0.25rem' }}>
      <button className="btn btn-danger btn-sm" disabled={loading} onClick={handleDelete}>Confirm</button>
      <button className="btn btn-secondary btn-sm" onClick={() => setConfirm(false)}>Cancel</button>
    </div>
  ) : (
    <button className="btn btn-secondary btn-sm" style={fullWidth ? { marginTop: '0.375rem', width: '100%' } : undefined} onClick={() => setConfirm(true)}>
      Delete
    </button>
  )
}
