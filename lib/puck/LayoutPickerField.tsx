'use client'

import { useEffect, useState } from 'react'
import { moduleEmbedOptions } from '@/lib/puck/module-embed-options'

export type LayoutRef = { id: string; type: string; name: string }

type LayoutRow = { id: string; name: string; type: string; status: string }

type Props = {
  value: LayoutRef | null | undefined
  onChange: (value: LayoutRef | null) => void
}

// Only layout types that declare embed options can be embedded - everything
// else (header, footer, notFound, ...) makes no sense inside a page.
const EMBEDDABLE_TYPES = new Set(Object.keys(moduleEmbedOptions))

export function LayoutPickerField({ value, onChange }: Props) {
  const [layouts, setLayouts] = useState<LayoutRow[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/admin/layouts')
      .then((r) => r.json())
      .then((d) => {
        const rows: LayoutRow[] = Array.isArray(d.layouts) ? d.layouts : []
        setLayouts(rows.filter((l) => EMBEDDABLE_TYPES.has(l.type)))
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  const selectStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem',
    borderRadius: 6,
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
    fontSize: '0.875rem',
  }

  if (loaded && layouts.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
        No embeddable layouts yet. Publish a layout that supports embedding (for example a shop Category layout) first.
      </p>
    )
  }

  return (
    <select
      style={selectStyle}
      value={value?.id ?? ''}
      onChange={(e) => {
        const id = e.target.value
        if (!id) return onChange(null)
        const row = layouts.find((l) => l.id === id)
        if (row) onChange({ id: row.id, type: row.type, name: row.name })
      }}
    >
      <option value="">Select a layout…</option>
      {layouts.map((l) => (
        <option key={l.id} value={l.id}>
          {l.name}
          {l.status !== 'published' ? ' (draft)' : ''}
        </option>
      ))}
    </select>
  )
}
