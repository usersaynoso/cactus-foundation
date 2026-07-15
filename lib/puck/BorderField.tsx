'use client'

import type { CustomFieldRender } from '@puckeditor/core'
import { useSiteColours } from '@/lib/puck/useSiteColours'
import { ColourSwatchButton, CustomColourSwatch } from '@/lib/puck/ColourSwatchButton'
import { splitLightDark, composeLightDark } from '@/lib/puck/lightDark'

export type BorderFieldValue = { show: 'show' | 'hide'; color: string }

export const BorderField: CustomFieldRender<BorderFieldValue> = ({ value, onChange, field }) => {
    const colours = useSiteColours()

    const show = value?.show ?? 'show'
    const color = value?.color ?? ''
    // The border colour carries an optional dark-mode arm as `light-dark(l, d)`;
    // split it so both swatch rows stay in sync. See lib/puck/lightDark.ts.
    const { light, dark } = splitLightDark(color)

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
        <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text)', marginBottom: '0.375rem' }}>
          {(field as { label?: string }).label ?? 'Border'}
        </label>
        <select
          value={show}
          onChange={(e) => onChange({ show: e.target.value as 'show' | 'hide', color })}
          style={{ width: '100%', padding: '0.375rem 0.5rem', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: '0.8125rem', fontFamily: 'inherit', marginBottom: '0.5rem' }}
        >
          <option value="show">Show</option>
          <option value="hide">Hide</option>
        </select>
        {show !== 'hide' && (
          <>
            {swatchRow(
              light,
              (v) => onChange({ show, color: composeLightDark(v, dark) }),
              'None / transparent',
              () => onChange({ show, color: composeLightDark('', dark) }),
            )}
            {/* Dark-mode override only once a light colour is set. */}
            {light && (
              <div style={{ marginTop: '0.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-muted)', marginBottom: '0.125rem' }}>Dark mode colour</label>
                {swatchRow(
                  dark,
                  (v) => onChange({ show, color: composeLightDark(light, v) }),
                  'Same as light',
                  () => onChange({ show, color: composeLightDark(light, '') }),
                )}
              </div>
            )}
          </>
        )}
      </div>
    )
}
