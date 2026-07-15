'use client'

import { useSiteColours } from '@/lib/puck/useSiteColours'
import { ColourSwatchButton, CustomColourSwatch } from '@/lib/puck/ColourSwatchButton'
import { splitLightDark, composeLightDark } from '@/lib/puck/lightDark'

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

  // The stored value carries an optional dark-mode arm as `light-dark(l, d)`.
  // Editing splits it back into the two arms so the swatches stay in sync, and
  // every change recomposes - a value with no dark arm stays the plain light
  // colour, so legacy data is untouched. See lib/puck/lightDark.ts.
  const { light, dark } = splitLightDark(value ?? '')

  const swatchRow = (selected: string, onPick: (v: string) => void, noneLabel: string, onNone: () => void) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', padding: '0.25rem 0' }}>
      {colours.map((c, i) => {
        const varName = `var(--color-${i + 1})`
        return (
          <ColourSwatchButton
            key={i}
            name={c.name}
            background={`linear-gradient(135deg, ${c.light} 50%, ${c.dark || c.light} 50%)`}
            selected={selected === varName}
            onClick={() => onPick(varName)}
          />
        )
      })}
      <ColourSwatchButton
        name={noneLabel}
        background="repeating-linear-gradient(45deg, var(--color-bg-subtle), var(--color-bg-subtle) 4px, var(--color-surface) 4px, var(--color-surface) 8px)"
        selected={!selected}
        onClick={onNone}
      />
      <CustomColourSwatch value={selected} onSelect={onPick} />
    </div>
  )

  return (
    <div>
      {label && (
        <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text)', marginBottom: '0.375rem' }}>
          {label}
        </label>
      )}
      {swatchRow(
        light,
        (v) => onChange(composeLightDark(v, dark)),
        'None / transparent',
        () => onChange(composeLightDark('', dark)),
      )}
      {allowManual && (
        <input
          type="text"
          value={light}
          onChange={(e) => onChange(composeLightDark(e.target.value, dark))}
          placeholder="Any CSS colour, e.g. #1a1a1a or rgb(0 0 0 / 50%)"
          style={{ width: '100%', marginTop: '0.375rem', padding: '0.375rem 0.5rem', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: '0.8125rem', fontFamily: 'inherit', background: 'var(--color-bg)', color: 'var(--color-text)' }}
        />
      )}
      {/* Dark-mode override only makes sense once a light colour is set - an
          empty light arm means "no colour", which needs no dark counterpart. */}
      {light && (
        <div style={{ marginTop: '0.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-muted)', marginBottom: '0.125rem' }}>Dark mode colour</label>
          {swatchRow(
            dark,
            (v) => onChange(composeLightDark(light, v)),
            'Same as light',
            () => onChange(composeLightDark(light, '')),
          )}
          {allowManual && (
            <input
              type="text"
              value={dark}
              onChange={(e) => onChange(composeLightDark(light, e.target.value))}
              placeholder="Dark mode colour (blank = same as light)"
              style={{ width: '100%', marginTop: '0.375rem', padding: '0.375rem 0.5rem', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: '0.8125rem', fontFamily: 'inherit', background: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
          )}
        </div>
      )}
    </div>
  )
}
