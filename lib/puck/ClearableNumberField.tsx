'use client'
import type { CustomFieldRender } from '@puckeditor/core'

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.375rem 0.5rem',
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  fontSize: '0.8125rem',
  fontFamily: 'inherit',
}

// Puck's built-in `type: 'number'` field coerces a cleared input to 0 (via
// Number('')), which is not nullish - so a render fallback like
// `cellHeight ?? logoHeight ?? 40` treats the empty field as a real 0 and the
// element collapses. This custom field emits `undefined` on an empty input so
// clearing genuinely means "no value, use the default".
export const ClearableNumberField: CustomFieldRender<number | undefined> = ({ value, onChange, field }) => {
  const { label } = field as { label?: string }
  return (
    <div>
      {label && (
        <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text)', marginBottom: '0.375rem' }}>
          {label}
        </label>
      )}
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => {
          const raw = e.target.value
          onChange(raw === '' ? (undefined as unknown as number) : Number(raw))
        }}
        style={inputStyle}
      />
    </div>
  )
}
