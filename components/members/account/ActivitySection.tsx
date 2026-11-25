'use client'

import { useEffect, useState } from 'react'

type ActivityEvent = {
  id: string
  type: string
  source: string | null
  metadata?: { linkedAdminPasskey?: boolean } | null
  createdAt: string
}

const CORE_LABELS: Record<string, string> = {
  login: 'Signed in',
  email_changed: 'Email address changed',
  // An app confirming it was the member before a sensitive change
  // (app/api/members/step-up/route.ts).
  step_up_confirmed: 'Confirmed it was you in an app',
}

function labelFor(event: ActivityEvent): string {
  // A sign-in made with the admin passkey under "Admins can use their admin
  // passkey to sign in to their member account" says so, so the member can
  // tell it apart from one made with a passkey of the account's own.
  if (!event.source && event.type === 'login' && event.metadata?.linkedAdminPasskey === true) {
    return 'Signed in with your admin passkey'
  }
  if (!event.source) return CORE_LABELS[event.type] ?? event.type
  return `${event.source}: ${event.type}`
}

export default function ActivitySection() {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null)

  useEffect(() => {
    fetch('/api/members/activity').then((r) => r.json()).then((d) => setEvents(d.events))
  }, [])

  return (
    <div>
      <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-semibold)', margin: '0 0 var(--space-4)', color: 'var(--color-text)' }}>
        Activity
      </h2>

      {events === null && <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>}
      {events?.length === 0 && <p className="field-hint">No activity recorded yet.</p>}
      {events?.map((e) => (
        <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--color-border)' }}>
          <span>{labelFor(e)}</span>
          <span style={{ color: 'var(--color-text-muted)' }}>{new Date(e.createdAt).toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}
