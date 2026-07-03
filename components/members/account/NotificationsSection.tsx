'use client'

import { useEffect, useState } from 'react'

type Category = { category: string; label: string; enabled: boolean; digestMode: 'INSTANT' | 'DAILY' | 'WEEKLY' | 'DISABLED' }

export default function NotificationsSection() {
  const [categories, setCategories] = useState<Category[] | null>(null)

  useEffect(() => {
    fetch('/api/members/notifications').then((r) => r.json()).then((d) => setCategories(d.categories))
  }, [])

  async function update(category: string, patch: Partial<Pick<Category, 'enabled' | 'digestMode'>>) {
    setCategories((prev) => prev?.map((c) => (c.category === category ? { ...c, ...patch } : c)) ?? prev)
    await fetch('/api/members/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, ...patch }),
    })
  }

  return (
    <div>
      <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-semibold)', margin: '0 0 var(--space-4)', color: 'var(--color-text)' }}>
        Notifications
      </h2>

      {categories === null && <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>}
      {categories?.length === 0 && (
        <p className="field-hint">No optional notifications are available yet.</p>
      )}
      {categories?.map((c) => (
        <div key={c.category} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-3) 0', borderBottom: '1px solid var(--color-border)', gap: 'var(--space-3)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={c.enabled} onChange={(e) => update(c.category, { enabled: e.target.checked })} />
            {c.label}
          </label>
          <select
            value={c.digestMode}
            disabled={!c.enabled}
            onChange={(e) => update(c.category, { digestMode: e.target.value as Category['digestMode'] })}
            style={{ height: 32, borderRadius: 'var(--radius)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
          >
            <option value="INSTANT">Instant</option>
            <option value="DAILY">Daily digest</option>
            <option value="WEEKLY">Weekly digest</option>
            <option value="DISABLED">Off</option>
          </select>
        </div>
      ))}
    </div>
  )
}
