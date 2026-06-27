'use client'

import { useState, useEffect, useCallback } from 'react'

type ColourSlot = { name: string; hex: string; darkHex: string }

type DesignTokens = {
  colours: ColourSlot[]
  typography: {
    fontHeading: string
    fontBody: string
    h1Size: string
    h2Size: string
    h3Size: string
    bodySize: string
    bodyLineHeight: string
  }
  spacing: { base: number }
  radius: { small: string; medium: string; large: string }
  shadows: { subtle: string; elevated: string }
}

const DEFAULTS: DesignTokens = {
  colours: [
    { name: 'Primary', hex: '#16a34a', darkHex: '#4ade80' },
    { name: 'Surface', hex: '#ffffff', darkHex: '#0f172a' },
  ],
  typography: {
    fontHeading: 'system-ui, sans-serif',
    fontBody: 'system-ui, sans-serif',
    h1Size: '2.5rem',
    h2Size: '1.875rem',
    h3Size: '1.5rem',
    bodySize: '1rem',
    bodyLineHeight: '1.75',
  },
  spacing: { base: 4 },
  radius: { small: '2px', medium: '6px', large: '9999px' },
  shadows: {
    subtle: '0 2px 8px rgba(0,0,0,0.08)',
    elevated: '0 4px 24px rgba(0,0,0,0.15)',
  },
}

export default function StyleGuidePage() {
  const [tokens, setTokens] = useState<DesignTokens>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/appearance')
      .then(r => r.json())
      .then(d => {
        if (d.designTokens) {
          const t = d.designTokens as Partial<DesignTokens>
          setTokens({
            colours: t.colours ?? DEFAULTS.colours,
            typography: { ...DEFAULTS.typography, ...(t.typography ?? {}) },
            spacing: { ...DEFAULTS.spacing, ...(t.spacing ?? {}) },
            radius: { ...DEFAULTS.radius, ...(t.radius ?? {}) },
            shadows: { ...DEFAULTS.shadows, ...(t.shadows ?? {}) },
          })
        }
        setLoading(false)
      })
      .catch(() => { setError('Failed to load style guide'); setLoading(false) })
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true); setSaved(false); setError('')
    try {
      const res = await fetch('/api/admin/appearance', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ designTokens: tokens }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Save failed') }
      else setSaved(true)
    } catch { setError('Save failed') }
    finally { setSaving(false) }
  }, [tokens])

  function setTypography(key: keyof DesignTokens['typography'], value: string) {
    setTokens(t => ({ ...t, typography: { ...t.typography, [key]: value } }))
    setSaved(false)
  }

  function setRadius(key: keyof DesignTokens['radius'], value: string) {
    setTokens(t => ({ ...t, radius: { ...t.radius, [key]: value } }))
    setSaved(false)
  }

  function setShadow(key: keyof DesignTokens['shadows'], value: string) {
    setTokens(t => ({ ...t, shadows: { ...t.shadows, [key]: value } }))
    setSaved(false)
  }

  function addColour() {
    if (tokens.colours.length >= 6) return
    setTokens(t => ({ ...t, colours: [...t.colours, { name: `Colour ${t.colours.length + 1}`, hex: '#cccccc', darkHex: '#888888' }] }))
    setSaved(false)
  }

  function removeColour(i: number) {
    if (tokens.colours.length <= 1) return
    setTokens(t => ({ ...t, colours: t.colours.filter((_, j) => j !== i) }))
    setSaved(false)
  }

  function updateColour(i: number, patch: Partial<ColourSlot>) {
    setTokens(t => ({ ...t, colours: t.colours.map((c, j) => j === i ? { ...c, ...patch } : c) }))
    setSaved(false)
  }

  if (loading) return <div style={{ padding: '2rem', color: '#6b7280' }}>Loading…</div>

  const spacingSteps = [1, 2, 3, 4, 6, 8, 12, 16, 24]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 1.25rem', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '0.8125rem' }}>
        <span style={{ fontWeight: 600, color: '#111827', fontSize: '0.9375rem' }}>Style Guide</span>
        <span style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {error && <span style={{ color: '#dc2626' }}>{error}</span>}
          {saved && <span style={{ color: '#15803d' }}>Saved ✓</span>}
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ fontSize: '0.8125rem', padding: '0.375rem 1rem' }}>
            {saving ? 'Saving…' : 'Save Style Guide'}
          </button>
        </span>
      </div>

      <div style={{ padding: '2rem', maxWidth: 720 }}>

        <Section title="Colour palette">
          <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 1rem' }}>Up to 6 named colours. Each colour has a light and dark mode variant. These become the only colour options throughout the layout builder.</p>
          {tokens.colours.map((c, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.75rem', alignItems: 'end', marginBottom: '0.75rem', padding: '0.75rem', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6 }}>
              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.75rem' }}>Name</label>
                <input type="text" value={c.name} onChange={e => updateColour(i, { name: e.target.value })} placeholder="e.g. Primary" />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.75rem' }}>Light mode</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input type="color" value={c.hex.startsWith('#') ? c.hex : '#ffffff'} onChange={e => updateColour(i, { hex: e.target.value })} style={{ width: 32, height: 32, padding: 2, border: '1px solid #e5e7eb', borderRadius: 4, cursor: 'pointer', flexShrink: 0 }} />
                  <input type="text" value={c.hex} onChange={e => updateColour(i, { hex: e.target.value })} placeholder="#000000" style={{ fontSize: '0.8125rem' }} />
                </div>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.75rem' }}>Dark mode</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input type="color" value={(c.darkHex || c.hex).startsWith('#') ? (c.darkHex || c.hex) : '#ffffff'} onChange={e => updateColour(i, { darkHex: e.target.value })} style={{ width: 32, height: 32, padding: 2, border: '1px solid #e5e7eb', borderRadius: 4, cursor: 'pointer', flexShrink: 0 }} />
                  <input type="text" value={c.darkHex} onChange={e => updateColour(i, { darkHex: e.target.value })} placeholder="#000000" style={{ fontSize: '0.8125rem' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', paddingBottom: '0.25rem' }}>
                <div style={{ width: 28, height: 28, background: c.hex, borderRadius: 4, border: '1px solid #e5e7eb', flexShrink: 0 }} title="Light" />
                <div style={{ width: 28, height: 28, background: c.darkHex || c.hex, borderRadius: 4, border: '1px solid #e5e7eb', flexShrink: 0 }} title="Dark" />
                {tokens.colours.length > 1 && (
                  <button onClick={() => removeColour(i)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '0.25rem', fontSize: '1rem', lineHeight: 1 }} title="Remove colour">✕</button>
                )}
              </div>
            </div>
          ))}
          {tokens.colours.length < 6 && (
            <button onClick={addColour} style={{ background: 'none', border: '1px dashed #d1d5db', borderRadius: 6, padding: '0.5rem 1rem', cursor: 'pointer', color: '#6b7280', fontSize: '0.875rem', fontFamily: 'inherit', width: '100%' }}>+ Add colour ({tokens.colours.length}/6)</button>
          )}
        </Section>

        <Section title="Typography">
          <TextField label="Heading font" value={tokens.typography.fontHeading} onChange={v => setTypography('fontHeading', v)} hint="CSS font-family value. E.g. 'Georgia, serif' or a Google Font name like 'Inter'" />
          <TextField label="Body font" value={tokens.typography.fontBody} onChange={v => setTypography('fontBody', v)} hint="CSS font-family value." />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
            <TextField label="H1 size" value={tokens.typography.h1Size} onChange={v => setTypography('h1Size', v)} />
            <TextField label="H2 size" value={tokens.typography.h2Size} onChange={v => setTypography('h2Size', v)} />
            <TextField label="H3 size" value={tokens.typography.h3Size} onChange={v => setTypography('h3Size', v)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <TextField label="Body font size" value={tokens.typography.bodySize} onChange={v => setTypography('bodySize', v)} />
            <TextField label="Body line height" value={tokens.typography.bodyLineHeight} onChange={v => setTypography('bodyLineHeight', v)} hint="E.g. 1.75" />
          </div>
        </Section>

        <Section title="Spacing scale">
          <div className="field">
            <label>Base unit (px)</label>
            <input type="number" min={1} max={16} value={tokens.spacing.base} onChange={e => { setTokens(t => ({ ...t, spacing: { base: parseInt(e.target.value) || 4 } })); setSaved(false) }} style={{ maxWidth: 120 }} />
            <span className="field-hint">Generates sp-1 through sp-9. Default 4px → 4, 8, 12, 16, 24, 32, 48, 64, 96px.</span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
            {spacingSteps.map((m, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ width: Math.min(tokens.spacing.base * m, 80), height: 8, background: '#dbeafe', borderRadius: 2, marginBottom: '0.25rem' }} />
                <span style={{ fontSize: '0.6875rem', color: '#9ca3af' }}>sp-{i + 1}<br />{tokens.spacing.base * m}px</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Border radius">
          <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 1rem' }}>Three radius presets used across the design system.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
            <div>
              <TextField label="Tight (badges/plates)" value={tokens.radius.small} onChange={v => setRadius('small', v)} hint="E.g. 2px" />
              <div style={{ width: 48, height: 24, background: '#dbeafe', borderRadius: tokens.radius.small, marginTop: '0.25rem' }} />
            </div>
            <div>
              <TextField label="Standard (cards/buttons)" value={tokens.radius.medium} onChange={v => setRadius('medium', v)} hint="E.g. 6px" />
              <div style={{ width: 48, height: 24, background: '#dbeafe', borderRadius: tokens.radius.medium, marginTop: '0.25rem' }} />
            </div>
            <div>
              <TextField label="Round (pills)" value={tokens.radius.large} onChange={v => setRadius('large', v)} hint="E.g. 9999px" />
              <div style={{ width: 64, height: 24, background: '#dbeafe', borderRadius: tokens.radius.large, marginTop: '0.25rem' }} />
            </div>
          </div>
        </Section>

        <Section title="Shadows">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div>
              <TextField label="Subtle shadow" value={tokens.shadows.subtle} onChange={v => setShadow('subtle', v)} hint="Used for cards and panels." />
              <div style={{ width: '100%', height: 48, background: '#ffffff', borderRadius: 6, boxShadow: tokens.shadows.subtle, marginTop: '0.5rem', border: '1px solid #f3f4f6' }} />
            </div>
            <div>
              <TextField label="Elevated shadow" value={tokens.shadows.elevated} onChange={v => setShadow('elevated', v)} hint="Used for modals and dropdowns." />
              <div style={{ width: '100%', height: 48, background: '#ffffff', borderRadius: 6, boxShadow: tokens.shadows.elevated, marginTop: '0.5rem', border: '1px solid #f3f4f6' }} />
            </div>
          </div>
        </Section>

        <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Style Guide'}
          </button>
          {saved && <span style={{ color: '#15803d', alignSelf: 'center' }}>Saved ✓</span>}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <h2 style={{ fontSize: '0.9375rem', fontWeight: 600, margin: '0 0 1rem', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '0.5rem' }}>{title}</h2>
      {children}
    </div>
  )
}

function TextField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} />
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  )
}
