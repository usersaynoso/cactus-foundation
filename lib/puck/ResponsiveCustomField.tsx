'use client'

import { ResponsiveFieldShell } from '@/lib/puck/ResponsiveValueField'
import type { ResponsiveValue } from '@/lib/puck/responsiveValue'

const RESPONSIVE_KEYS = new Set(['desktop', 'tablet', 'mobile'])

// normalizeResponsiveValue (responsiveValue.ts) can't be reused for custom
// fields: it treats ANY object as an already-responsive value, but a custom
// field's own value is frequently itself an object - {mode,color} (background),
// {show,color} (border), {id,type,name} (layout picker). So detect the
// responsive shape by its keys (every key in desktop/tablet/mobile) and
// otherwise wrap the whole legacy value - object or primitive - as the desktop
// breakpoint, atomically. That gives object-valued custom fields the same
// self-healing read the flat text/select/number fields get for free, with no
// data migration, and treats the field's object as one indivisible unit per
// breakpoint (no partial per-key merging across breakpoints).
export function normalizeResponsiveCustom<T>(value: unknown): ResponsiveValue<T> {
  if (value === undefined || value === null || value === '') return {}
  if (
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value as object).every((k) => RESPONSIVE_KEYS.has(k))
  ) {
    return value as ResponsiveValue<T>
  }
  return { desktop: value as T }
}

// Generic per-breakpoint wrapper for ANY type:'custom' field. Supply the inner
// renderer via the `inner` prop from the field descriptor's own render, the
// same inline pattern config.tsx already uses to wrap SiteColourField:
//
//   someField: { type: 'custom', label: 'Overlay colour',
//     render: (props) => <ResponsiveCustomField {...props}
//       inner={(p) => <SiteColourField value={p.value} onChange={p.onChange} />} /> }
//
// The inner field's whole value is stored atomically per breakpoint. The inner
// owns its own label/markup exactly as it does un-wrapped (BorderField and the
// BgColorField family read field.label themselves; SiteColourField shows none);
// the shell only adds the desktop/tablet/mobile switcher beside it, so this
// stays genuinely field-agnostic and never double-renders a label.
export function ResponsiveCustomField({
  value,
  onChange,
  field,
  // React.ComponentType<any>: the inner renderers are deliberately heterogeneous
  // (string value vs object value vs {value,onChange} vs full CustomFieldRender),
  // so a single precise prop type can't fit them all - the wrapper is agnostic.
  inner: Inner,
}: {
  value: unknown
  onChange: (value: unknown) => void
  field?: unknown
  inner: React.ComponentType<{ value: unknown; onChange: (v: unknown) => void; field?: unknown }>
}) {
  return (
    <ResponsiveFieldShell<unknown>
      value={normalizeResponsiveCustom(value)}
      onChange={onChange as (next: ResponsiveValue<unknown>) => void}
      renderInput={({ value: v, setValue }) => <Inner value={v} onChange={setValue} field={field} />}
    />
  )
}
