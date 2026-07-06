'use client'

import { useState } from 'react'
import type { CustomFieldRender } from '@puckeditor/core'
import { normalizeResponsiveValue, type Device, type ResponsiveValue } from '@/lib/puck/responsiveValue'

// Same Monitor/Tablet/Smartphone glyphs as Puck's own viewport switcher above
// the canvas (lucide-react, vendored inside @puckeditor/core rather than a
// direct dependency here) - drawn inline so the two switchers read as one
// visual language without adding an icon library dependency.
export function MonitorIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
  )
}
export function TabletIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="16" height="20" x="4" y="2" rx="2" />
      <line x1="12" x2="12.01" y1="18" y2="18" />
    </svg>
  )
}
export function SmartphoneIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="14" height="20" x="5" y="2" rx="2" />
      <path d="M12 18h.01" />
    </svg>
  )
}

const DEVICES: { key: Device; Icon: () => React.ReactNode; title: string }[] = [
  { key: 'desktop', Icon: MonitorIcon, title: 'Desktop' },
  { key: 'tablet', Icon: TabletIcon, title: 'Tablet' },
  { key: 'mobile', Icon: SmartphoneIcon, title: 'Mobile' },
]

// Falls back to the next-wider breakpoint's value, same rule GridBlock uses
// to compute the effective grid-template-columns per breakpoint - keeps the
// field's placeholder text ("Same as desktop") honest.
function inherited<T>(value: ResponsiveValue<T> | undefined, device: Device): T | undefined {
  if (!value) return undefined
  if (device === 'desktop') return value.desktop
  if (device === 'tablet') return value.tablet ?? value.desktop
  return value.mobile ?? value.tablet ?? value.desktop
}

// Elementor-style device switcher: one input, three tiny icon toggles above it
// that swap which breakpoint's value the input reads/writes. Reused for both
// text and select inputs via the `renderInput` render-prop, so every
// responsive field in the sidebar looks and behaves the same way.
function ResponsiveFieldShell<T>({
  label,
  value,
  onChange,
  renderInput,
}: {
  label?: string
  value: ResponsiveValue<T> | undefined
  onChange: (next: ResponsiveValue<T>) => void
  renderInput: (opts: { value: T | undefined; placeholder: string; setValue: (v: T) => void }) => React.ReactNode
}) {
  const [device, setDevice] = useState<Device>('desktop')
  const hasOverride = (d: Device) => value?.[d] !== undefined && value?.[d] !== ''

  const placeholder = device === 'desktop' ? '' : `Same as ${device === 'tablet' ? 'desktop' : 'tablet'}`
  const current = value?.[device]
  const effective = current !== undefined && current !== '' ? current : inherited(value, device)

  return (
    <div>
      {label && (
        <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text)', marginBottom: '0.375rem' }}>
          {label}
        </label>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {renderInput({
            value: effective,
            placeholder,
            setValue: (v) => onChange({ ...value, [device]: v }),
          })}
        </div>
        <div style={{ display: 'flex', flexShrink: 0, gap: '0.25rem' }}>
          {DEVICES.map((d) => (
            <button
              key={d.key}
              type="button"
              title={d.title}
              onClick={() => setDevice(d.key)}
              style={{
                position: 'relative',
                width: 26, height: 26,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid var(--color-border)',
                borderRadius: 4,
                background: device === d.key ? 'var(--color-primary-subtle)' : 'var(--color-surface)',
                color: device === d.key ? 'var(--color-primary)' : 'var(--color-text-muted)',
                cursor: 'pointer',
              }}
            >
              <d.Icon />
              {hasOverride(d.key) && (
                <span style={{ position: 'absolute', top: 2, right: 2, width: 4, height: 4, borderRadius: '50%', background: 'var(--color-primary)' }} />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

type FieldWithOptions = { label?: string; options?: { value: string; label: string }[] }

// Plain component exports, not factories: config.tsx (imported by both the
// client editor and server RSC render paths) can only *reference* a
// 'use client' export, never *call* one at module scope - a factory function
// call would cross that boundary illegally. Per-field config (the select's
// options list) rides along on the Puck field descriptor itself instead,
// the same way BorderField reads `field.label`.
export const ResponsiveTextField: CustomFieldRender<ResponsiveValue<string>> = ({ value, onChange, field }) => (
  <ResponsiveFieldShell
    label={(field as FieldWithOptions).label}
    value={normalizeResponsiveValue(value)}
    onChange={onChange}
    renderInput={({ value: v, placeholder, setValue }) => (
      <input
        type="text"
        value={v ?? ''}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        style={{ width: '100%', padding: '0.375rem 0.5rem', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: '0.8125rem', fontFamily: 'inherit' }}
      />
    )}
  />
)

export const ResponsiveSelectField: CustomFieldRender<ResponsiveValue<string>> = ({ value, onChange, field }) => {
  const options = (field as FieldWithOptions).options ?? []
  return (
    <ResponsiveFieldShell
      label={(field as FieldWithOptions).label}
      value={normalizeResponsiveValue(value)}
      onChange={onChange}
      renderInput={({ value: v, placeholder, setValue }) => (
        <select
          value={v ?? ''}
          onChange={(e) => setValue(e.target.value)}
          style={{ width: '100%', padding: '0.375rem 0.5rem', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: '0.8125rem', fontFamily: 'inherit' }}
        >
          <option value="">{placeholder || 'Default'}</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    />
  )
}
