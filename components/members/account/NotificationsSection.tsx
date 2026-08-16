'use client'

import { useEffect, useState } from 'react'

type Category = {
  category: string
  label: string
  required: boolean
  emailOffered: boolean
  smsOffered: boolean
  email: boolean
  sms: boolean
  digestMode: 'INSTANT' | 'DAILY' | 'WEEKLY' | 'DISABLED'
}

type Patch = { email?: boolean; sms?: boolean; digestMode?: Category['digestMode'] }

export default function NotificationsSection() {
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/members/notifications')
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []))
      .catch(() => setError('Could not load your notification settings.'))
  }, [])

  async function update(category: string, patch: Patch) {
    const before = categories
    setError('')
    setCategories((prev) => prev?.map((c) => (c.category === category ? { ...c, ...patch } : c)) ?? prev)

    const body =
      patch.email !== undefined ? { category, channel: 'EMAIL', enabled: patch.email }
      : patch.sms !== undefined ? { category, channel: 'SMS', enabled: patch.sms }
      : { category, channel: 'EMAIL', digestMode: patch.digestMode }

    const res = await fetch('/api/members/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      // The server is the one that knows whether this would have left the member
      // with no way of hearing about something, so its refusal is what puts the
      // tick back rather than a guess made here.
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Could not save that.')
      setCategories(before ?? null)
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-semibold)', margin: '0 0 var(--space-4)', color: 'var(--color-text)' }}>
        Notifications
      </h2>

      {error && <div className="alert alert-danger" style={{ marginBottom: 'var(--space-4)' }}>{error}</div>}

      {categories === null && !error && <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>}
      {categories?.length === 0 && (
        <p className="field-hint">No optional notifications are available yet.</p>
      )}

      {categories?.map((c) => (
        <div
          key={c.category}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 'var(--space-3) 0',
            borderBottom: '1px solid var(--color-border)',
            gap: 'var(--space-3)',
          }}
        >
          <div>
            <div style={{ color: 'var(--color-text)' }}>{c.label}</div>
            {c.required && (
              <div className="field-hint">Keep at least one of these ticked - it is how we keep you posted.</div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            {c.emailOffered && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer', color: 'var(--color-text)' }}>
                <input type="checkbox" checked={c.email} onChange={(e) => update(c.category, { email: e.target.checked })} />
                Email
              </label>
            )}
            {c.smsOffered && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer', color: 'var(--color-text)' }}>
                <input type="checkbox" checked={c.sms} onChange={(e) => update(c.category, { sms: e.target.checked })} />
                Text message
              </label>
            )}
            {!c.required && (
              <select
                value={c.digestMode}
                disabled={!c.email}
                onChange={(e) => update(c.category, { digestMode: e.target.value as Category['digestMode'] })}
                style={{ height: 32, borderRadius: 'var(--radius)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
              >
                <option value="INSTANT">Instant</option>
                <option value="DAILY">Daily digest</option>
                <option value="WEEKLY">Weekly digest</option>
                <option value="DISABLED">Off</option>
              </select>
            )}
          </div>
        </div>
      ))}

      {categories?.some((c) => c.smsOffered) && (
        <p className="field-hint" style={{ marginTop: 'var(--space-4)' }}>
          Text messages go to the phone number on the order they are about, so make sure there is one on it.
        </p>
      )}
    </div>
  )
}
