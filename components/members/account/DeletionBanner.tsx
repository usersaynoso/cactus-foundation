'use client'

import { useState } from 'react'

export default function DeletionBanner({ scheduledAt }: { scheduledAt: string }) {
  const [loading, setLoading] = useState(false)
  const date = new Date(scheduledAt)

  async function cancel() {
    setLoading(true)
    try {
      await fetch('/api/members/cancel-deletion', { method: 'POST' })
      window.location.reload()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="alert alert-danger"
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}
    >
      <span>Your account is scheduled for deletion on {date.toLocaleDateString()}.</span>
      <button className="btn btn-secondary btn-sm" disabled={loading} onClick={cancel}>
        {loading ? 'Cancelling…' : 'Cancel deletion'}
      </button>
    </div>
  )
}
