'use client'

import { useEffect, useRef, useState } from 'react'

type Props = {
  layoutId: string
  name: string
  description: string | null
  priority: number
  status: string
  onSave: (patch: { name: string; description: string | null; priority: number }) => void
  onStatusChange: (status: string) => void
  saving: boolean
  saved: boolean
  error: string
  canDelete: boolean
  onDeleteClick: () => void
  deleting: boolean
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.375rem 0.5rem', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem', fontFamily: 'inherit',
  background: 'var(--color-surface)', color: 'var(--color-text)', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text)', marginBottom: '0.375rem',
}

const SETTINGS_DEBOUNCE_MS = 800

export default function LayoutSettingsTab({ layoutId, name, description, priority, status, onSave, onStatusChange, saving, saved, error, canDelete, onDeleteClick, deleting }: Props) {
  const [local, setLocal] = useState({ name, description: description ?? '', priority })
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipNextRef = useRef(true)

  useEffect(() => {
    if (skipNextRef.current) { skipNextRef.current = false; return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onSave({ name: local.name, description: local.description || null, priority: local.priority })
    }, SETTINGS_DEBOUNCE_MS)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onSave is stable; adding it would reset the timer unnecessarily
  }, [local])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
      <div style={{ fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.6875rem' }}>
        Layout settings
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

      {(saving || saved || error) && (
        <p style={{ fontSize: '0.75rem', margin: 0, color: error ? 'var(--color-destructive)' : saving ? 'var(--color-text-muted)' : 'var(--color-success)' }}>
          {error || (saving ? 'Saving…' : 'Saved ✓')}
        </p>
      )}

      <a
        href={`/layout-preview/${layoutId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-secondary"
        style={{ width: '100%', fontSize: '0.8125rem', textAlign: 'center', textDecoration: 'none' }}
      >
        Preview
      </a>

      {canDelete && (
        <button
          className="btn btn-danger"
          style={{ width: '100%', fontSize: '0.8125rem' }}
          disabled={deleting}
          onClick={onDeleteClick}
        >
          Delete layout
        </button>
      )}
    </div>
  )
}
