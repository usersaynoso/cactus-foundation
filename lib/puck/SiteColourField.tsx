'use client'

import { useEffect, useState } from 'react'

type ColourSlot = { name: string; hex: string; darkHex?: string }

type Props = {
  value: string
  onChange: (value: string) => void
}

export function SiteColourField({ value, onChange }: Props) {
  const [colours, setColours] = useState<ColourSlot[]>([])

  useEffect(() => {
    fetch('/api/admin/appearance')
      .then(r => r.json())
      .then(d => setColours(d.designTokens?.colours ?? []))
      .catch(() => {})
  }, [])

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', padding: '0.25rem 0' }}>
      {colours.map((c, i) => {
        const varName = `var(--color-${i + 1})`
        const isSelected = value === varName
        return (
          <button
            key={i}
            type="button"
            title={c.name}
            onClick={() => onChange(varName)}
            style={{
              width: 28, height: 28, borderRadius: 4, background: c.hex,
              border: isSelected ? '2px solid var(--color-text)' : '1px solid var(--color-border)',
              cursor: 'pointer', padding: 0, outline: isSelected ? '2px solid var(--color-success)' : 'none', outlineOffset: 1,
            }}
          />
        )
      })}
      <button
        type="button"
        title="None / transparent"
        onClick={() => onChange('')}
        style={{
          width: 28, height: 28, borderRadius: 4,
          background: 'repeating-linear-gradient(45deg, var(--color-bg-subtle), var(--color-bg-subtle) 4px, var(--color-surface) 4px, var(--color-surface) 8px)',
          border: !value ? '2px solid var(--color-text)' : '1px solid var(--color-border)',
          cursor: 'pointer', padding: 0, outline: !value ? '2px solid var(--color-success)' : 'none', outlineOffset: 1,
        }}
      />
    </div>
  )
}
