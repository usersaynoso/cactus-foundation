'use client'
import type { CustomFieldRender } from '@puckeditor/core'

export type MinMaxPair = { min?: string; max?: string }

type FieldWithLabels = { label?: string; minLabel?: string; maxLabel?: string }

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.375rem 0.5rem',
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  fontSize: '0.8125rem',
  fontFamily: 'inherit',
}

// Two plain text inputs side by side, sharing one Puck field slot - the only
// way to get a "min / max next to each other" row, since Puck always renders
// each top-level `fields` key as its own full-width row (see ResponsiveFieldShell
// for the same one-custom-field-two-inputs shape, used for device toggles instead).
export const MinMaxPairField: CustomFieldRender<MinMaxPair> = ({ value, onChange, field }) => {
  const { label, minLabel = 'Min', maxLabel = 'Max' } = field as FieldWithLabels
  const v = value ?? {}
  return (
    <div>
      {label && (
        <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text)', marginBottom: '0.375rem' }}>
          {label}
        </label>
      )}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <label style={{ display: 'block', fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>{minLabel}</label>
          <input type="text" value={v.min ?? ''} onChange={(e) => onChange({ ...v, min: e.target.value })} style={inputStyle} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <label style={{ display: 'block', fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>{maxLabel}</label>
          <input type="text" value={v.max ?? ''} onChange={(e) => onChange({ ...v, max: e.target.value })} style={inputStyle} />
        </div>
      </div>
    </div>
  )
}
