'use client'

import { useEffect, useState } from 'react'

type ActivityEvent = { id: string; type: string; source: string | null; createdAt: string }

const CORE_LABELS: Record<string, string> = {
  login: 'Signed in',
}

function labelFor(event: ActivityEvent): string {
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
