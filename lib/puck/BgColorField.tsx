'use client'

import type { CustomFieldRender } from '@puckeditor/core'
import { useSiteColours } from '@/lib/puck/useSiteColours'
import { ColourSwatchButton, CustomColourSwatch } from '@/lib/puck/ColourSwatchButton'
import { splitLightDark, composeLightDark } from '@/lib/puck/lightDark'

export type BgColorValue = { mode: string; color: string }
type Option = { value: string; label: string }
type BgColorProps = Parameters<CustomFieldRender<BgColorValue>>[0]

// A translucent background colour is stored as a color-mix() so it still rides a
// CSS variable (rgba() can't wrap `var(--color-1)`). We split the stored string
// back into its base colour + alpha so the swatches and the opacity slider stay
// in sync. Anything we don't recognise (a legacy rgba(), a raw hex) is treated
// as a fully-opaque base so it still edits cleanly.
const OPACITY_RE = /^color-mix\(in srgb,\s*([\s\S]+?)\s+(\d+(?:\.\d+)?)%,\s*transparent\)$/

function splitBgColour(color: string): { base: string; alpha: number } {
  const m = color.match(OPACITY_RE)
  if (m && m[1]) return { base: m[1].trim(), alpha: Math.round(Number(m[2])) }
  return { base: color, alpha: 100 }
}

function composeBgColour(base: string, alpha: number): string {
  if (!base) return ''
  if (alpha >= 100) return base
  return `color-mix(in srgb, ${base} ${alpha}%, transparent)`
}

// Per-block dark-mode overrides ride the shared `light-dark()` encoding - see
// lib/puck/lightDark.ts for how it resolves site-wide with no render change.

type BgFieldOpts = { allowOpacity?: boolean; allowDark?: boolean }

// Which second input each background mode actually needs. Solid-colour modes
// (including "transparent → solid on scroll", whose colour is the solid it
// lands on) get the swatch row; 'gradient' is a CSS gradient string, which no
// swatch can express, so it gets its own text box; image/decorative/none modes
// paint nothing from `color`, so they show no colour input at all — showing
// swatches there was exactly the "options that aren't applicable" noise.
const SWATCH_MODES = new Set(['color', 'transparent-scroll'])

// Shared body for every "background mode select + colour swatches, one box"
// field. Named with a `use` prefix (not a component) so it can call hooks -
// each exported field below is the actual component, just delegating render.
// `allowOpacity` adds a see-through slider for solid-colour backgrounds (e.g. a
// readable card over a photo). `allowDark` adds a separate dark-mode colour so a
// block can carry one colour for light mode and another for dark.
function useBgColorFieldBody(options: Option[], { value, onChange, field }: BgColorProps, { allowOpacity = false, allowDark = false }: BgFieldOpts = {}) {
  const colours = useSiteColours()
  const mode = value?.mode ?? options[0]?.value ?? ''
  const color = value?.color ?? ''
  const { light, dark } = splitLightDark(color)
  const { base: lightBase, alpha } = splitBgColour(light)
  const { base: darkBase } = splitBgColour(dark)

  // Rebuild the whole colour value from its parts - one opacity applies to both
  // arms so the panel stays equally see-through in either mode.
  const build = (nextLight: string, nextDark: string, nextAlpha: number) =>
    composeLightDark(composeBgColour(nextLight, nextAlpha), nextDark ? composeBgColour(nextDark, nextAlpha) : '')

  const swatchRow = (selectedBase: string, onPick: (varName: string) => void, noneLabel: string, onNone: () => void) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', padding: '0.25rem 0' }}>
      {colours.map((c, i) => {
        const varName = `var(--color-${i + 1})`
        return (
          <ColourSwatchButton
            key={i}
            name={c.name}
            background={`linear-gradient(135deg, ${c.light} 50%, ${c.dark || c.light} 50%)`}
            selected={selectedBase === varName}
            onClick={() => onPick(varName)}
          />
        )
      })}
      <ColourSwatchButton
        name={noneLabel}
        background="repeating-linear-gradient(45deg, var(--color-bg-subtle), var(--color-bg-subtle) 4px, var(--color-surface) 4px, var(--color-surface) 8px)"
        selected={!selectedBase}
        onClick={onNone}
      />
      <CustomColourSwatch value={selectedBase} onSelect={onPick} />
    </div>
  )

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
      {SWATCH_MODES.has(mode) && swatchRow(
        lightBase,
        (varName) => onChange({ mode, color: build(varName, darkBase, alpha) }),
        'None / transparent',
        () => onChange({ mode, color: build('', darkBase, alpha) }),
      )}
      {mode === 'gradient' && (
        <input
          type="text"
          value={color}
          onChange={(e) => onChange({ mode, color: e.target.value })}
          placeholder="e.g. linear-gradient(135deg, #0ea5e9, #9333ea)"
          style={{ width: '100%', padding: '0.375rem 0.5rem', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: '0.8125rem', fontFamily: 'inherit', background: 'var(--color-bg)', color: 'var(--color-text)' }}
        />
      )}
      {allowDark && mode === 'color' && lightBase && (
        <div style={{ marginTop: '0.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-muted)', marginBottom: '0.125rem' }}>Dark mode colour</label>
          {swatchRow(
            darkBase,
            (varName) => onChange({ mode, color: build(lightBase, varName, alpha) }),
            'Same as light',
            () => onChange({ mode, color: build(lightBase, '', alpha) }),
          )}
        </div>
      )}
      {allowOpacity && mode === 'color' && lightBase && (
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
            onChange={(e) => onChange({ mode, color: build(lightBase, darkBase, Number(e.target.value)) })}
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
], props, { allowOpacity: true, allowDark: true })

export const HeroBgColorField: CustomFieldRender<BgColorValue> = (props) => useBgColorFieldBody([
  { value: 'gradient', label: 'Gradient' },
  { value: 'color', label: 'Colour' },
  { value: 'image', label: 'Image' },
  { value: 'none', label: 'None' },
], props, { allowOpacity: true, allowDark: true })

export const HeaderBgColorField: CustomFieldRender<BgColorValue> = (props) => useBgColorFieldBody([
  { value: 'color', label: 'Solid colour' },
  { value: 'transparent', label: 'Always transparent' },
  { value: 'transparent-scroll', label: 'Transparent → solid on scroll' },
], props, { allowDark: true })

export const PageBgColorField: CustomFieldRender<BgColorValue> = (props) => useBgColorFieldBody([
  { value: 'none', label: 'None (site background)' },
  { value: 'color', label: 'Colour' },
], props, { allowDark: true })
