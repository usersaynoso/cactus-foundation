'use client'

import { useEffect, useState } from 'react'

type Contact = { fullName: string | null }

// The overview tab's editable "Your name" card, saved straight to the member
// record and used to fill the checkout's name box in.
//
// Not gated behind the Profile section switch. That one holds the public-profile
// fields; this is the name an order is made out to, and the sites most likely to
// want it (a shop whose members only exist to have somewhere to see their
// orders) are exactly the sites that turn the public profile off.
//
// No phone number here on purpose: a number belongs to the address a parcel is
// going to, so the shop keeps one per saved address instead.
export default function ContactDetailsCard({ initial }: { initial: Contact }) {
  const [fullName, setFullName] = useState(initial.fullName ?? '')
  const [saved, setSaved] = useState<Contact>(initial)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // The confirmation is a note that a save happened, not a permanent state of
  // the page - it goes on its own rather than sitting there until the next one.
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(''), 4000)
    return () => clearTimeout(timer)
  }, [message])

  const dirty = fullName !== (saved.fullName ?? '')

  async function handleSave() {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch('/api/members/contact', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to save')
      setSaved({ fullName: d.fullName ?? null })
      setMessage('Name updated.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card" style={{ padding: 'var(--space-4)', display: 'grid', gap: 'var(--space-3)' }}>
      <div>
        <h2 className="card-title" style={{ margin: 0 }}>Your name</h2>
        <p style={{ margin: '0.25rem 0 0', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
          Filled in for you at the checkout, so you only type it once.
        </p>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      <div className="field" style={{ margin: 0, maxWidth: 320 }}>
        <label htmlFor="member-full-name">Full name</label>
        <input
          id="member-full-name"
          type="text"
          autoComplete="name"
          maxLength={120}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
      </div>

      <div>
        <button className="btn btn-primary btn-sm" disabled={saving || !dirty} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save name'}
        </button>
      </div>
    </div>
  )
}
