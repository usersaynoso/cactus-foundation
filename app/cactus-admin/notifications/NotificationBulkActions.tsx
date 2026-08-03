'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  /** Everything in the table, not just the page's capped slice. */
  total: number
  unread: number
  /**
   * Open deployment notifications - changes saved but not yet live. Delete all
   * leaves these alone, so they come off the number the confirm names.
   */
  pendingDeploy: number
}

export default function NotificationBulkActions({ total, unread, pendingDeploy }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // What Delete all would actually remove - the open deployment notification is
  // deliberately left behind by the endpoint.
  const deletable = total - pendingDeploy

  async function handleMarkAllRead() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Action failed')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteAll() {
    // Names the real number, which can be larger than the hundred rows on screen
    // and is smaller than the total when a deployment is still pending - nobody
    // should discover either after the fact.
    const kept = pendingDeploy > 0
      ? ' Changes still awaiting deployment are kept.'
      : ''
    if (!confirm(`Delete ${deletable} notification${deletable === 1 ? '' : 's'}? This cannot be undone.${kept}`)) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/notifications', { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Delete failed')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setLoading(false)
    }
  }

  if (total === 0) return null

  return (
    <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
      {error && (
        <span style={{ color: 'var(--color-destructive)', fontSize: 'var(--text-sm)' }}>{error}</span>
      )}
      <button
        className="btn btn-secondary btn-sm"
        disabled={loading || unread === 0}
        onClick={handleMarkAllRead}
      >
        Mark all as read
      </button>
      <button
        className="btn btn-danger btn-sm"
        disabled={loading || deletable === 0}
        onClick={handleDeleteAll}
      >
        Delete all
      </button>
    </div>
  )
}
