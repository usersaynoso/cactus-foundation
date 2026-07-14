'use client'

import { useEffect, useRef, useState } from 'react'

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

const SETTINGS_DEBOUNCE_MS = 800

export default function LayoutSettingsTab({ name, description, priority, status, onSave, onStatusChange, saving, saved, error }: Props) {
  const [local, setLocal] = useState({ name, description: description ?? '', priority })
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Only autosave when the local edits genuinely differ from the persisted props.
  // A plain (re)mount seeds `local` straight from props, so this comparison is false
  // and no save fires — which is what stops the loop: the panel gets torn down and
  // remounted on every save/status re-render (and StrictMode double-invokes effects
  // in dev), and a skip-first-run flag re-arms on each of those, firing a phantom
  // save that flips saving/saved, forcing another remount. Comparing to props makes
  // remounts idempotent; genuine edits still diverge from props and save normally.
  useEffect(() => {
    const unchanged =
      local.name === name &&
      local.description === (description ?? '') &&
      local.priority === priority
    if (unchanged) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onSave({ name: local.name, description: local.description || null, priority: local.priority })
    }, SETTINGS_DEBOUNCE_MS)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onSave is stable; adding it would reset the timer unnecessarily
  }, [local, name, description, priority])

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
          When two layouts both claim the same page, the higher number wins. Leave it at 0 unless you are settling an argument between two of them.
        </p>
      </div>

      {(saving || saved || error) && (
        <p style={{ fontSize: '0.75rem', margin: 0, color: error ? 'var(--color-destructive)' : saving ? 'var(--color-text-muted)' : 'var(--color-success)' }}>
          {error || (saving ? 'Saving…' : 'Saved ✓')}
        </p>
      )}
    </div>
  )
}
