'use client'

import type { CustomFieldRender } from '@puckeditor/core'
import { useSiteColours } from '@/lib/puck/useSiteColours'
import { ColourSwatchButton } from '@/lib/puck/ColourSwatchButton'

export type BgColorValue = { mode: string; color: string }
type Option = { value: string; label: string }
type BgColorProps = Parameters<CustomFieldRender<BgColorValue>>[0]

// Shared body for every "background mode select + colour swatches, one box"
// field. Named with a `use` prefix (not a component) so it can call hooks -
// each exported field below is the actual component, just delegating render.
function useBgColorFieldBody(options: Option[], { value, onChange, field }: BgColorProps) {
  const colours = useSiteColours()
  const mode = value?.mode ?? options[0]?.value ?? ''
  const color = value?.color ?? ''

  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text)', marginBottom: '0.375rem' }}>
        {(field as { label?: string }).label ?? 'Background'}
      </label>
      <select
        value={mode}
        onChange={(e) => onChange({ mode: e.target.value, color })}
        style={{ width: '100%', padding: '0.375rem 0.5rem', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: '0.8125rem', fontFamily: 'inherit', marginBottom: '0.5rem' }}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', padding: '0.25rem 0' }}>
        {colours.map((c, i) => {
          const varName = `var(--color-${i + 1})`
          return (
            <ColourSwatchButton
              key={i}
              name={c.name}
              background={`linear-gradient(135deg, ${c.light} 50%, ${c.dark || c.light} 50%)`}
              selected={color === varName}
              onClick={() => onChange({ mode, color: varName })}
            />
          )
        })}
        <ColourSwatchButton
          name="None / transparent"
          background="repeating-linear-gradient(45deg, var(--color-bg-subtle), var(--color-bg-subtle) 4px, var(--color-surface) 4px, var(--color-surface) 8px)"
          selected={!color}
          onClick={() => onChange({ mode, color: '' })}
        />
      </div>
    </div>
  )
}

export const SectionBgColorField: CustomFieldRender<BgColorValue> = (props) => useBgColorFieldBody([
  { value: 'none', label: 'None' },
  { value: 'color', label: 'Colour' },
  { value: 'gradient', label: 'Gradient (CSS)' },
  { value: 'image', label: 'Image URL' },
  { value: 'grid-scan', label: 'Grid + scan beam (decorative)' },
], props)

export const HeroBgColorField: CustomFieldRender<BgColorValue> = (props) => useBgColorFieldBody([
  { value: 'gradient', label: 'Gradient' },
  { value: 'color', label: 'Colour' },
  { value: 'image', label: 'Image' },
  { value: 'none', label: 'None' },
], props)

export const HeaderBgColorField: CustomFieldRender<BgColorValue> = (props) => useBgColorFieldBody([
  { value: 'color', label: 'Solid colour' },
  { value: 'transparent', label: 'Always transparent' },
  { value: 'transparent-scroll', label: 'Transparent → solid on scroll' },
], props)

export const PageBgColorField: CustomFieldRender<BgColorValue> = (props) => useBgColorFieldBody([
  { value: 'none', label: 'None (site background)' },
  { value: 'color', label: 'Colour' },
], props)
