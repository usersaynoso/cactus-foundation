'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  id: string
  isRead: boolean
  canRedeploy: boolean
}

export default function NotificationActions({ id, isRead, canRedeploy }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleRedeploy() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/notifications/${id}/redeploy`, { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Redeploy failed')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Redeploy failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleToggleRead() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/notifications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: !isRead }),
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

  async function handleDelete() {
    if (!confirm('Delete this notification? This cannot be undone.')) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/notifications/${id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Delete failed')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Delete failed')
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
      {error && (
        <span style={{ color: 'var(--color-destructive)', fontSize: 'var(--text-sm)' }}>{error}</span>
      )}
      {canRedeploy && (
        <button className="btn btn-primary btn-sm" disabled={loading} onClick={handleRedeploy}>
          Redeploy now
        </button>
      )}
      <button className="btn btn-secondary btn-sm" disabled={loading} onClick={handleToggleRead}>
        {isRead ? 'Mark as unread' : 'Mark as read'}
      </button>
      <button className="btn btn-danger btn-sm" disabled={loading} onClick={handleDelete}>
        Delete
      </button>
    </div>
  )
}
