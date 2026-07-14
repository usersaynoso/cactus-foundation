'use client'

import { useState } from 'react'
import type { CustomFieldRender } from '@puckeditor/core'
import { ResponsiveFieldShell } from '@/lib/puck/ResponsiveValueField'
import { normalizeResponsiveValue, type ResponsiveValue } from '@/lib/puck/responsiveValue'

// A CSS length as "number + unit picker" instead of a free-text box: the owner
// types 50 and picks % / px / vh from the dropdown on the right, rather than
// having to know CSS length syntax. The stored value stays the plain CSS
// string ("50%"), so every existing render path and every previously saved
// value keeps working untouched. Which units are on offer rides along on the
// Puck field descriptor (`units: ['px','%']`), same as select options do.
export const DEFAULT_UNITS = ['px', '%', 'rem', 'em', 'vh', 'vw']

type FieldWithUnits = { label?: string; units?: string[] }

const NUM_RE = /^-?\d*\.?\d+$/

export function splitUnitValue(value: string | undefined, units: string[]): { num: string; unit: string; raw: string } {
  const v = (value ?? '').trim()
  const first = units[0] ?? 'px'
  if (!v) return { num: '', unit: first, raw: '' }
  // Longest suffix first so 'rem' isn't swallowed by 'em', 'vmax' by 'ax', etc.
  for (const u of [...units].sort((a, b) => b.length - a.length)) {
    if (v.toLowerCase().endsWith(u.toLowerCase())) {
      const num = v.slice(0, v.length - u.length).trim()
      if (NUM_RE.test(num)) return { num, unit: u, raw: v }
    }
  }
  // A bare number reads as the first unit (matches how most fields treated it).
  if (NUM_RE.test(v)) return { num: v, unit: first, raw: v }
  // Anything else (auto, calc(), a keyword) is a power-user value: shown as-is
  // in the input so it is never invisible-but-active, replaced once edited.
  return { num: '', unit: first, raw: v }
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '0.375rem 0.5rem',
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  fontSize: '0.8125rem',
  fontFamily: 'inherit',
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
}

const unitStyle: React.CSSProperties = {
  flexShrink: 0,
  width: 58,
  padding: '0.375rem 0.25rem',
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  fontSize: '0.8125rem',
  fontFamily: 'inherit',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
}

// The shared input row. `onChange(undefined)` means "cleared" so responsive
// breakpoints can fall back to the wider device rather than pinning to 0.
export function UnitValueInput({
  value,
  placeholder,
  units,
  onChange,
}: {
  value: string | undefined
  placeholder?: string
  units: string[]
  onChange: (v: string | undefined) => void
}) {
  const { num, unit, raw } = splitUnitValue(value, units)
  const parsed = num !== '' || raw === ''
  // Remember the picked unit while the number box is still empty, so choosing
  // "%" then typing 50 yields 50% (state is otherwise derived from the value).
  const [pendingUnit, setPendingUnit] = useState<string | null>(null)
  const shownUnit = parsed && num !== '' ? unit : (pendingUnit ?? unit)

  const emit = (nextNum: string, nextUnit: string) => {
    const t = nextNum.trim()
    if (t === '') { onChange(undefined); return }
    onChange(NUM_RE.test(t) ? `${t}${nextUnit}` : t)
  }

  return (
    <div style={{ display: 'flex', gap: '0.375rem' }}>
      <input
        type="text"
        inputMode="decimal"
        value={parsed ? num : raw}
        placeholder={placeholder}
        onChange={(e) => emit(e.target.value, shownUnit)}
        style={inputStyle}
      />
      <select
        value={shownUnit}
        onChange={(e) => {
          setPendingUnit(e.target.value)
          if (num !== '') emit(num, e.target.value)
        }}
        aria-label="Unit"
        style={unitStyle}
      >
        {units.map((u) => <option key={u} value={u}>{u}</option>)}
      </select>
    </div>
  )
}

// Flat (non-responsive) variant, e.g. a sticky offset that has no per-device use.
export const UnitValueField: CustomFieldRender<string | undefined> = ({ value, onChange, field }) => {
  const { label, units = DEFAULT_UNITS } = field as FieldWithUnits
  return (
    <div>
      {label && (
        <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text)', marginBottom: '0.375rem' }}>
          {label}
        </label>
      )}
      <UnitValueInput value={value} units={units} onChange={(v) => onChange(v as string)} />
    </div>
  )
}

// Per-breakpoint variant: same desktop/tablet/mobile switcher every other
// responsive field uses, one unit-picker input per device. Stores the same
// ResponsiveValue<string> shape ResponsiveTextField did, so swapping a field
// from free text to this needs no data migration.
export const ResponsiveUnitValueField: CustomFieldRender<ResponsiveValue<string>> = ({ value, onChange, field }) => {
  const { label, units = DEFAULT_UNITS } = field as FieldWithUnits
  return (
    <ResponsiveFieldShell<string>
      label={label}
      value={normalizeResponsiveValue(value)}
      onChange={onChange}
      renderInput={({ value: v, placeholder, setValue }) => (
        <UnitValueInput value={v} placeholder={placeholder} units={units} onChange={setValue} />
      )}
    />
  )
}
