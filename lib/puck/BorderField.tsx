'use client'

import type { CustomFieldRender } from '@puckeditor/core'
import { useSiteColours } from '@/lib/puck/useSiteColours'
import { ColourSwatchButton, CustomColourSwatch } from '@/lib/puck/ColourSwatchButton'

export type BorderFieldValue = { show: 'show' | 'hide'; color: string }

export const BorderField: CustomFieldRender<BorderFieldValue> = ({ value, onChange, field }) => {
    const colours = useSiteColours()

    const show = value?.show ?? 'show'
    const color = value?.color ?? ''

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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', padding: '0.25rem 0' }}>
            {colours.map((c, i) => {
              const varName = `var(--color-${i + 1})`
              return (
                <ColourSwatchButton
                  key={i}
                  name={c.name}
                  background={`linear-gradient(135deg, ${c.light} 50%, ${c.dark || c.light} 50%)`}
                  selected={color === varName}
                  onClick={() => onChange({ show, color: varName })}
                />
              )
            })}
            <ColourSwatchButton
              name="None / transparent"
              background="repeating-linear-gradient(45deg, var(--color-bg-subtle), var(--color-bg-subtle) 4px, var(--color-surface) 4px, var(--color-surface) 8px)"
              selected={!color}
              onClick={() => onChange({ show, color: '' })}
            />
            <CustomColourSwatch value={color} onSelect={(c) => onChange({ show, color: c })} />
          </div>
        )}
      </div>
    )
}
