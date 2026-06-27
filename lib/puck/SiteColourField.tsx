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
              border: isSelected ? '2px solid #111827' : '1px solid rgba(0,0,0,0.15)',
              cursor: 'pointer', padding: 0, outline: isSelected ? '2px solid #16a34a' : 'none', outlineOffset: 1,
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
          background: 'repeating-linear-gradient(45deg, #f3f4f6, #f3f4f6 4px, #fff 4px, #fff 8px)',
          border: !value ? '2px solid #111827' : '1px solid #e5e7eb',
          cursor: 'pointer', padding: 0, outline: !value ? '2px solid #16a34a' : 'none', outlineOffset: 1,
        }}
      />
    </div>
  )
}
