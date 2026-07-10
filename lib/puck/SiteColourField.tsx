'use client'

import { useSiteColours } from '@/lib/puck/useSiteColours'
import { ColourSwatchButton } from '@/lib/puck/ColourSwatchButton'

type Props = {
  value: string
  onChange: (value: string) => void
  label?: string
}

export function SiteColourField({ value, onChange, label }: Props) {
  const colours = useSiteColours()

  return (
    <div>
      {label && (
        <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text)', marginBottom: '0.375rem' }}>
          {label}
        </label>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', padding: '0.25rem 0' }}>
      {colours.map((c, i) => {
        const varName = `var(--color-${i + 1})`
        return (
          <ColourSwatchButton
            key={i}
            name={c.name}
            background={`linear-gradient(135deg, ${c.light} 50%, ${c.dark || c.light} 50%)`}
            selected={value === varName}
            onClick={() => onChange(varName)}
          />
        )
      })}
      <ColourSwatchButton
        name="None / transparent"
        background="repeating-linear-gradient(45deg, var(--color-bg-subtle), var(--color-bg-subtle) 4px, var(--color-surface) 4px, var(--color-surface) 8px)"
        selected={!value}
        onClick={() => onChange('')}
      />
      </div>
    </div>
  )
}
