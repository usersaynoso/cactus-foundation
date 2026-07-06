import type { GlobalColour } from '@/lib/design/tokens'

// One swatch-row + hex-input pair, shared by any light/dark colour field
// (design tokens' colour fields, the Branding tab's theme/background colour).
// In "dark" mode the palette swatches offer each global colour's dark variant,
// so picking from the palette matches what shows on the dark frontend.
export function ColourPickerRow({ value, onChange, colours, mode, placeholder }: { value?: string; onChange: (v: string) => void; colours: GlobalColour[]; mode: 'light' | 'dark'; placeholder: string }) {
  const swatchOf = (c: GlobalColour) => (mode === 'dark' ? (c.dark || c.light) : c.light)
  return (
    <>
      <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '0.375rem', alignItems: 'center' }}>
        <input type="color" value={(value ?? '').startsWith('#') ? value : '#ffffff'} onChange={e => onChange(e.target.value)} style={{ width: 28, height: 28, padding: 2, border: '1px solid var(--color-border)', borderRadius: 4, cursor: 'pointer', flexShrink: 0 }} title="Pick a colour" />
        {colours.map(c => {
          const sw = swatchOf(c)
          return (
            <button key={c.id} type="button" title={c.name}
              onClick={() => onChange(value === sw ? '' : sw)}
              style={{ width: 24, height: 24, borderRadius: 4, background: sw, border: value === sw ? '2px solid var(--color-text)' : '1px solid var(--color-border)', cursor: 'pointer', padding: 0, outline: value === sw ? '2px solid var(--color-success)' : 'none', outlineOffset: 1, flexShrink: 0 }}
            />
          )
        })}
        {value && (
          <button type="button" onClick={() => onChange('')}
            style={{ width: 24, height: 24, borderRadius: 4, background: 'none', border: '1px solid var(--color-border)', cursor: 'pointer', padding: 0, fontSize: '0.625rem', color: 'var(--color-muted)', lineHeight: 1 }}
            title="Clear">✕</button>
        )}
      </div>
      <input type="text" value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </>
  )
}
