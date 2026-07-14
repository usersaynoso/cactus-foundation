'use client'

import { useSiteColours } from '@/lib/puck/useSiteColours'
import { ColourSwatchButton, CustomColourSwatch } from '@/lib/puck/ColourSwatchButton'

type Props = {
  value: string
  onChange: (value: string) => void
  label?: string
  // Adds a free-text box under the swatches for any CSS colour (rgb(), a named
  // colour, an old hex). The rainbow swatch already covers picking a hex, but a
  // field that used to be a plain text input keeps its full manual override.
  allowManual?: boolean
}

export function SiteColourField({ value, onChange, label, allowManual }: Props) {
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
      <CustomColourSwatch value={value} onSelect={onChange} />
      </div>
      {allowManual && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Any CSS colour, e.g. #1a1a1a or rgb(0 0 0 / 50%)"
          style={{ width: '100%', marginTop: '0.375rem', padding: '0.375rem 0.5rem', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: '0.8125rem', fontFamily: 'inherit', background: 'var(--color-bg)', color: 'var(--color-text)' }}
        />
      )}
    </div>
  )
}
