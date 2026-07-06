'use client'

import type { CustomFieldRender } from '@puckeditor/core'
import { normalizeResponsiveValue, type Device, type ResponsiveValue } from '@/lib/puck/responsiveValue'
import { MonitorIcon, TabletIcon, SmartphoneIcon } from '@/lib/puck/ResponsiveValueField'

const DEVICES: { key: Device; Icon: () => React.ReactNode; title: string }[] = [
  { key: 'desktop', Icon: MonitorIcon, title: 'Desktop' },
  { key: 'tablet', Icon: TabletIcon, title: 'Tablet' },
  { key: 'mobile', Icon: SmartphoneIcon, title: 'Mobile' },
]

// Single combined field replacing the old three separate "Hide on desktop /
// tablet / mobile: Yes/No" dropdowns. Each icon is its own independent
// hide/show toggle for that breakpoint - no cascading fallback between
// devices (unlike ResponsiveValueField's value inputs), since a hide flag
// has no sensible "inherited" middle state. Highlighted = visible (default),
// dimmed + struck through = hidden on that device.
export const VisibilityField: CustomFieldRender<ResponsiveValue<string>> = ({ value, onChange, field }) => {
  const v = normalizeResponsiveValue<string>(value)
  const label = (field as { label?: string }).label

  const toggle = (device: Device) => {
    const hidden = v[device] === 'true'
    onChange({ ...v, [device]: hidden ? 'false' : 'true' })
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
      {label && (
        <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text)' }}>
          {label}
        </label>
      )}
      <div style={{ display: 'flex', flexShrink: 0, gap: '0.25rem' }}>
        {DEVICES.map((d) => {
          const hidden = v[d.key] === 'true'
          return (
            <button
              key={d.key}
              type="button"
              title={hidden ? `Hidden on ${d.title}` : `Visible on ${d.title}`}
              onClick={() => toggle(d.key)}
              style={{
                position: 'relative',
                width: 26, height: 26,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid var(--color-border)',
                borderRadius: 4,
                background: hidden ? 'var(--color-surface)' : 'var(--color-primary-subtle)',
                color: hidden ? 'var(--color-text-muted)' : 'var(--color-primary)',
                opacity: hidden ? 0.5 : 1,
                cursor: 'pointer',
              }}
            >
              <d.Icon />
              {hidden && (
                <span style={{ position: 'absolute', width: 18, height: 1.5, background: 'var(--color-text-muted)', transform: 'rotate(-45deg)' }} />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
