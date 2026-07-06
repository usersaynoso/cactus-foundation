'use client'

import { useState } from 'react'

type Props = {
  name: string
  description: string | null
  priority: number
  status: string
  onSave: (patch: { name: string; description: string | null; priority: number }) => void
  onStatusChange: (status: string) => void
  saving: boolean
  saved: boolean
  error: string
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.375rem 0.5rem', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem', fontFamily: 'inherit',
  background: 'var(--color-surface)', color: 'var(--color-text)', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text)', marginBottom: '0.375rem',
}

export default function LayoutSettingsTab({ name, description, priority, status, onSave, onStatusChange, saving, saved, error }: Props) {
  const [local, setLocal] = useState({ name, description: description ?? '', priority })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
      <div style={{ fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.6875rem' }}>
        Layout settings
      </div>

      <div>
        <label style={labelStyle}>Status</label>
        <select
          style={inputStyle}
          value={status}
          onChange={(e) => onStatusChange(e.target.value)}
        >
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
      </div>

      <div>
        <label style={labelStyle}>Name</label>
        <input
          style={inputStyle}
          value={local.name}
          onChange={(e) => setLocal((l) => ({ ...l, name: e.target.value }))}
        />
      </div>

      <div>
        <label style={labelStyle}>Description</label>
        <textarea
          style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
          value={local.description}
          onChange={(e) => setLocal((l) => ({ ...l, description: e.target.value }))}
        />
      </div>

      <div>
        <label style={labelStyle}>Priority</label>
        <input
          type="number"
          style={inputStyle}
          value={local.priority}
          onChange={(e) => setLocal((l) => ({ ...l, priority: Number(e.target.value) || 0 }))}
        />
        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: '0.25rem 0 0' }}>
          Manual tiebreaker when two layouts have the same specificity score.
        </p>
      </div>

      <button
        className="btn btn-primary"
        style={{ width: '100%', fontSize: '0.8125rem' }}
        onClick={() => onSave({ name: local.name, description: local.description || null, priority: local.priority })}
      >
        Save Settings
      </button>

      {(saving || saved || error) && (
        <p style={{ fontSize: '0.75rem', margin: 0, color: error ? 'var(--color-destructive)' : saving ? 'var(--color-text-muted)' : 'var(--color-success)' }}>
          {error || (saving ? 'Saving…' : 'Saved ✓')}
        </p>
      )}
    </div>
  )
}
