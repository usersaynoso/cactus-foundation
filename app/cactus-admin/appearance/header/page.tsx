'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useAdminPath } from '@/components/admin/AdminPathContext'

type HeaderConfig = {
  bgMode?: string
  bgColor?: string
  height?: string
  sticky?: string
  borderBottom?: string
  borderColor?: string
  maxWidth?: string
  logoHeight?: number
  showTextWithLogo?: string
  logoHomeUrl?: string
  itemFontSize?: string
  itemFontWeight?: string
  itemColor?: string
  showMobileToggle?: string
}

const DEFAULTS: Required<HeaderConfig> = {
  bgMode: 'color',
  bgColor: 'var(--color-bg)',
  height: '64px',
  sticky: 'yes',
  borderBottom: 'show',
  borderColor: 'var(--color-border)',
  maxWidth: '1200px',
  logoHeight: 40,
  showTextWithLogo: 'false',
  logoHomeUrl: '/',
  itemFontSize: 'medium',
  itemFontWeight: 'medium',
  itemColor: '',
  showMobileToggle: 'collapse',
}

export default function AppearanceHeaderPage() {
  const [config, setConfig] = useState<Required<HeaderConfig>>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch('/api/admin/appearance')
      .then((r) => r.json())
      .then((d) => {
        setConfig({ ...DEFAULTS, ...(d.headerConfig ?? {}) })
        setLoading(false)
      })
      .catch(() => { setError('Failed to load header settings'); setLoading(false) })
  }, [])

  const save = useCallback((updated: Required<HeaderConfig>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSaving(true)
      setSaved(false)
      try {
        const res = await fetch('/api/admin/appearance', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ headerConfig: updated }),
        })
        if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Save failed') }
        else { setSaved(true); setError('') }
      } catch { setError('Save failed') }
      finally { setSaving(false) }
    }, 800)
  }, [])

  const set = useCallback(<K extends keyof HeaderConfig>(key: K, value: HeaderConfig[K]) => {
    setConfig((prev) => {
      const updated = { ...prev, [key]: value } as Required<HeaderConfig>
      save(updated)
      return updated
    })
  }, [save])

  if (loading) return <div style={{ padding: '2rem', color: '#6b7280' }}>Loading…</div>

  const label: React.CSSProperties = { display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#374151', marginBottom: '0.25rem' }
  const input: React.CSSProperties = { width: '100%', padding: '0.4375rem 0.625rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.875rem', fontFamily: 'inherit', color: '#111827', background: '#fff', boxSizing: 'border-box' }
  const select: React.CSSProperties = { ...input }
  const fieldset: React.CSSProperties = { border: 'none', padding: 0, margin: 0 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', padding: '0.625rem 1.25rem', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '0.8125rem', color: '#6b7280', flexShrink: 0 }}>
        <AppearanceTabBar active="header" />
        <span style={{ marginLeft: 'auto' }}>
          {saving && 'Saving…'}
          {!saving && saved && <span style={{ color: '#15803d' }}>Saved ✓</span>}
          {error && <span style={{ color: '#dc2626' }}>{error}</span>}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
        <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          <section>
            <h3 style={{ margin: '0 0 1rem', fontSize: '0.9375rem', fontWeight: 600, color: '#111827' }}>Background</h3>
            <fieldset style={fieldset}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={label}>Mode</label>
                  <select style={select} value={config.bgMode} onChange={(e) => set('bgMode', e.target.value)}>
                    <option value="color">Solid colour</option>
                    <option value="transparent">Always transparent</option>
                    <option value="transparent-scroll">Transparent until scroll</option>
                  </select>
                </div>
                <div>
                  <label style={label}>Colour (hex/CSS)</label>
                  <input style={input} value={config.bgColor} onChange={(e) => set('bgColor', e.target.value)} placeholder="var(--color-bg)" />
                </div>
              </div>
            </fieldset>
          </section>

          <section>
            <h3 style={{ margin: '0 0 1rem', fontSize: '0.9375rem', fontWeight: 600, color: '#111827' }}>Size &amp; position</h3>
            <fieldset style={fieldset}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={label}>Height</label>
                  <select style={select} value={config.height} onChange={(e) => set('height', e.target.value)}>
                    <option value="auto">Auto</option>
                    <option value="48px">48px</option>
                    <option value="64px">64px (default)</option>
                    <option value="72px">72px</option>
                    <option value="80px">80px</option>
                    <option value="96px">96px</option>
                  </select>
                </div>
                <div>
                  <label style={label}>Sticky</label>
                  <select style={select} value={config.sticky} onChange={(e) => set('sticky', e.target.value)}>
                    <option value="yes">Sticky (fixed to top)</option>
                    <option value="no">Static</option>
                  </select>
                </div>
                <div>
                  <label style={label}>Content max-width</label>
                  <select style={select} value={config.maxWidth} onChange={(e) => set('maxWidth', e.target.value)}>
                    <option value="none">Full width</option>
                    <option value="720px">720px</option>
                    <option value="960px">960px</option>
                    <option value="1200px">1200px</option>
                    <option value="1400px">1400px</option>
                  </select>
                </div>
              </div>
            </fieldset>
          </section>

          <section>
            <h3 style={{ margin: '0 0 1rem', fontSize: '0.9375rem', fontWeight: 600, color: '#111827' }}>Border</h3>
            <fieldset style={fieldset}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={label}>Bottom border</label>
                  <select style={select} value={config.borderBottom} onChange={(e) => set('borderBottom', e.target.value)}>
                    <option value="show">Show</option>
                    <option value="hide">Hide</option>
                  </select>
                </div>
                <div>
                  <label style={label}>Border colour</label>
                  <input style={input} value={config.borderColor} onChange={(e) => set('borderColor', e.target.value)} placeholder="var(--color-border)" />
                </div>
              </div>
            </fieldset>
          </section>

          <section>
            <h3 style={{ margin: '0 0 1rem', fontSize: '0.9375rem', fontWeight: 600, color: '#111827' }}>Logo</h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.8125rem', color: '#6b7280' }}>
              Logo image is set in <Link href="general" style={{ color: '#2563eb' }}>General Settings</Link>. Menu is taken from your Main Menu.
            </p>
            <fieldset style={fieldset}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={label}>Logo height (px)</label>
                  <input style={input} type="number" min={16} max={128} value={config.logoHeight} onChange={(e) => set('logoHeight', Number(e.target.value))} />
                </div>
                <div>
                  <label style={label}>Show site name</label>
                  <select style={select} value={config.showTextWithLogo} onChange={(e) => set('showTextWithLogo', e.target.value)}>
                    <option value="false">Logo only</option>
                    <option value="true">Logo + site name</option>
                  </select>
                </div>
                <div>
                  <label style={label}>Logo link URL</label>
                  <input style={input} value={config.logoHomeUrl} onChange={(e) => set('logoHomeUrl', e.target.value)} placeholder="/" />
                </div>
              </div>
            </fieldset>
          </section>

          <section>
            <h3 style={{ margin: '0 0 1rem', fontSize: '0.9375rem', fontWeight: 600, color: '#111827' }}>Navigation</h3>
            <fieldset style={fieldset}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={label}>Font size</label>
                  <select style={select} value={config.itemFontSize} onChange={(e) => set('itemFontSize', e.target.value)}>
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </select>
                </div>
                <div>
                  <label style={label}>Font weight</label>
                  <select style={select} value={config.itemFontWeight} onChange={(e) => set('itemFontWeight', e.target.value)}>
                    <option value="normal">Normal</option>
                    <option value="medium">Medium</option>
                    <option value="semibold">Semibold</option>
                    <option value="bold">Bold</option>
                  </select>
                </div>
                <div>
                  <label style={label}>Link colour</label>
                  <input style={input} value={config.itemColor} onChange={(e) => set('itemColor', e.target.value)} placeholder="Default (CSS variable)" />
                </div>
                <div>
                  <label style={label}>Mobile nav</label>
                  <select style={select} value={config.showMobileToggle} onChange={(e) => set('showMobileToggle', e.target.value)}>
                    <option value="collapse">Collapse to hamburger</option>
                    <option value="show">Always show</option>
                  </select>
                </div>
              </div>
            </fieldset>
          </section>

        </div>
      </div>
    </div>
  )
}

function AppearanceTabBar({ active }: { active: 'header' | 'footer' | 'design' }) {
  const adminPath = useAdminPath()
  const tabs = [
    { key: 'header', label: 'Header', href: `/${adminPath}/appearance/header` },
    { key: 'footer', label: 'Footer', href: `/${adminPath}/appearance/footer` },
    { key: 'design', label: 'Design Tokens', href: `/${adminPath}/appearance/design` },
  ] as const
  return (
    <div style={{ display: 'flex', gap: '0.25rem' }}>
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} style={{
          padding: '0.375rem 0.875rem', borderRadius: 4, textDecoration: 'none', fontWeight: t.key === active ? 600 : 400,
          background: t.key === active ? '#ffffff' : 'transparent', color: t.key === active ? '#111827' : '#6b7280',
          border: t.key === active ? '1px solid #e5e7eb' : '1px solid transparent', fontSize: '0.8125rem',
        }}>
          {t.label}
        </Link>
      ))}
    </div>
  )
}
