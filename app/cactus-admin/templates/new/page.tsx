'use client'
import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'

export default function NewTemplatePage() {
  const router = useRouter()
  const pathname = usePathname()
  const adminPath = pathname.split('/')[1] ?? ''
  const [name, setName] = useState('')
  const [type, setType] = useState<'HEADER' | 'FOOTER' | 'PAGE'>('PAGE')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate() {
    if (!name.trim()) return
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/admin/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), type }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to create')
      router.push(`/${adminPath}/templates/${d.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create')
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <div className="page-header">
        <h1 className="page-title">New Template</h1>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="field">
        <label>Template name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Main Header, Blog Footer"
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
      </div>

      <div className="field">
        <label>Type</label>
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="HEADER">Header — shown at the top of every page</option>
          <option value="FOOTER">Footer — shown at the bottom of every page</option>
          <option value="PAGE">Page template — used as a starting layout for pages</option>
        </select>
        <span className="field-hint">Header and Footer types appear in Settings → General as selectable site-wide templates.</span>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button className="btn btn-primary" disabled={!name.trim() || loading} onClick={handleCreate}>
          {loading ? 'Creating…' : 'Create & open editor'}
        </button>
        <button className="btn btn-secondary" onClick={() => router.back()}>Cancel</button>
      </div>
    </div>
  )
}
