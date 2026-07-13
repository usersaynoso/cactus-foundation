'use client'

import type { CustomFieldRender } from '@puckeditor/core'
import { useSiteColours } from '@/lib/puck/useSiteColours'
import { ColourSwatchButton } from '@/lib/puck/ColourSwatchButton'

export type BgColorValue = { mode: string; color: string }
type Option = { value: string; label: string }
type BgColorProps = Parameters<CustomFieldRender<BgColorValue>>[0]

// A translucent background colour is stored as a color-mix() so it still rides a
// CSS variable (rgba() can't wrap `var(--color-1)`). We split the stored string
// back into its base colour + alpha so the swatches and the opacity slider stay
// in sync. Anything we don't recognise (a legacy rgba(), a raw hex) is treated
// as a fully-opaque base so it still edits cleanly.
const OPACITY_RE = /^color-mix\(in srgb,\s*(.+?)\s+(\d+(?:\.\d+)?)%,\s*transparent\)$/

function splitBgColour(color: string): { base: string; alpha: number } {
  const m = color.match(OPACITY_RE)
  if (m && m[1]) return { base: m[1], alpha: Math.round(Number(m[2])) }
  return { base: color, alpha: 100 }
}

function composeBgColour(base: string, alpha: number): string {
  if (!base) return ''
  if (alpha >= 100) return base
  return `color-mix(in srgb, ${base} ${alpha}%, transparent)`
}

// Shared body for every "background mode select + colour swatches, one box"
// field. Named with a `use` prefix (not a component) so it can call hooks -
// each exported field below is the actual component, just delegating render.
// `allowOpacity` adds a see-through slider for solid-colour backgrounds so an
// owner can make a colour translucent (e.g. a readable card over a photo).
function useBgColorFieldBody(options: Option[], { value, onChange, field }: BgColorProps, allowOpacity = false) {
  const colours = useSiteColours()
  const mode = value?.mode ?? options[0]?.value ?? ''
  const color = value?.color ?? ''
  const { base, alpha } = splitBgColour(color)

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
      {mode !== 'none' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', padding: '0.25rem 0' }}>
          {colours.map((c, i) => {
            const varName = `var(--color-${i + 1})`
            return (
              <ColourSwatchButton
                key={i}
                name={c.name}
                background={`linear-gradient(135deg, ${c.light} 50%, ${c.dark || c.light} 50%)`}
                selected={base === varName}
                onClick={() => onChange({ mode, color: composeBgColour(varName, alpha) })}
              />
            )
          })}
          <ColourSwatchButton
            name="None / transparent"
            background="repeating-linear-gradient(45deg, var(--color-bg-subtle), var(--color-bg-subtle) 4px, var(--color-surface) 4px, var(--color-surface) 8px)"
            selected={!base}
            onClick={() => onChange({ mode, color: '' })}
          />
        </div>
      )}
      {allowOpacity && mode === 'color' && base && (
        <div style={{ marginTop: '0.5rem' }}>
          <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--color-muted)', marginBottom: '0.25rem' }}>
            <span>Colour opacity</span>
            <span>{alpha}%</span>
          </label>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={alpha}
            onChange={(e) => onChange({ mode, color: composeBgColour(base, Number(e.target.value)) })}
            style={{ width: '100%', accentColor: 'var(--color-primary)' }}
          />
        </div>
      )}
    </div>
  )
}

export const SectionBgColorField: CustomFieldRender<BgColorValue> = (props) => useBgColorFieldBody([
  { value: 'none', label: 'None' },
  { value: 'color', label: 'Colour' },
  { value: 'gradient', label: 'Gradient (CSS)' },
  { value: 'image', label: 'Image URL' },
  { value: 'grid-scan', label: 'Grid + scan beam (decorative)' },
], props, true)

export const HeroBgColorField: CustomFieldRender<BgColorValue> = (props) => useBgColorFieldBody([
  { value: 'gradient', label: 'Gradient' },
  { value: 'color', label: 'Colour' },
  { value: 'image', label: 'Image' },
  { value: 'none', label: 'None' },
], props, true)

export const HeaderBgColorField: CustomFieldRender<BgColorValue> = (props) => useBgColorFieldBody([
  { value: 'color', label: 'Solid colour' },
  { value: 'transparent', label: 'Always transparent' },
  { value: 'transparent-scroll', label: 'Transparent → solid on scroll' },
], props)

export const PageBgColorField: CustomFieldRender<BgColorValue> = (props) => useBgColorFieldBody([
  { value: 'none', label: 'None (site background)' },
  { value: 'color', label: 'Colour' },
], props)
