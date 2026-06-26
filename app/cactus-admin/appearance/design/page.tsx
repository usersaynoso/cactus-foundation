'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useAdminPath } from '@/components/admin/AdminPathContext'

type Tokens = {
  primaryColor: string
  primaryFg: string
  bgColor: string
  fgColor: string
  mutedColor: string
  borderColor: string
  fontHeading: string
  fontBody: string
  borderRadius: string
  linkColor: string
  linkHoverColor: string
  h1Size: string
  h2Size: string
  h3Size: string
  bodySize: string
  bodyLineHeight: string
  containerMaxWidth: string
}

const DEFAULTS: Tokens = {
  primaryColor: '#16a34a', primaryFg: '#ffffff', bgColor: '#ffffff', fgColor: '#111827',
  mutedColor: '#6b7280', borderColor: '#e5e7eb', fontHeading: 'system-ui, sans-serif',
  fontBody: 'system-ui, sans-serif', borderRadius: '6px', linkColor: '#16a34a',
  linkHoverColor: '#15803d', h1Size: '2.5rem', h2Size: '1.875rem', h3Size: '1.5rem',
  bodySize: '1rem', bodyLineHeight: '1.75', containerMaxWidth: '1200px',
}

export default function DesignTokensPage() {
  const [tokens, setTokens] = useState<Tokens>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/appearance')
      .then((r) => r.json())
      .then((d) => { if (d.designTokens) setTokens({ ...DEFAULTS, ...(d.designTokens as Partial<Tokens>) }); setLoading(false) })
      .catch(() => { setError('Failed to load design tokens'); setLoading(false) })
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

  function set<K extends keyof Tokens>(key: K, value: string) {
    setTokens((t) => ({ ...t, [key]: value }))
    setSaved(false)
  }

  if (loading) return <div style={{ padding: '2rem', color: '#6b7280' }}>Loading…</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', padding: '0.625rem 1.25rem', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '0.8125rem', color: '#6b7280' }}>
        <AppearanceTabBar active="design" />
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {error && <span style={{ color: '#dc2626' }}>{error}</span>}
          {saved && <span style={{ color: '#15803d' }}>Saved ✓</span>}
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ fontSize: '0.8125rem', padding: '0.375rem 1rem' }}>
            {saving ? 'Saving…' : 'Save Design'}
          </button>
        </span>
      </div>
      <div style={{ padding: '2rem', maxWidth: 680 }}>
        <Section title="Brand colours">
          <ColorField label="Primary colour" value={tokens.primaryColor} onChange={(v) => set('primaryColor', v)} hint="Used for buttons, links, and accents." />
          <ColorField label="Primary text (on primary bg)" value={tokens.primaryFg} onChange={(v) => set('primaryFg', v)} hint="Text colour used on primary-coloured backgrounds." />
          <ColorField label="Link colour" value={tokens.linkColor} onChange={(v) => set('linkColor', v)} />
          <ColorField label="Link hover colour" value={tokens.linkHoverColor} onChange={(v) => set('linkHoverColor', v)} />
        </Section>
        <Section title="Page colours">
          <ColorField label="Background" value={tokens.bgColor} onChange={(v) => set('bgColor', v)} />
          <ColorField label="Foreground (heading text)" value={tokens.fgColor} onChange={(v) => set('fgColor', v)} />
          <ColorField label="Muted text" value={tokens.mutedColor} onChange={(v) => set('mutedColor', v)} />
          <ColorField label="Border colour" value={tokens.borderColor} onChange={(v) => set('borderColor', v)} />
        </Section>
        <Section title="Typography">
          <TextField label="Heading font stack" value={tokens.fontHeading} onChange={(v) => set('fontHeading', v)} hint="CSS font-family value. E.g. 'Georgia, serif'" />
          <TextField label="Body font stack" value={tokens.fontBody} onChange={(v) => set('fontBody', v)} hint="CSS font-family value." />
          <TextField label="H1 size" value={tokens.h1Size} onChange={(v) => set('h1Size', v)} hint="E.g. 2.5rem or 40px" />
          <TextField label="H2 size" value={tokens.h2Size} onChange={(v) => set('h2Size', v)} />
          <TextField label="H3 size" value={tokens.h3Size} onChange={(v) => set('h3Size', v)} />
          <TextField label="Body font size" value={tokens.bodySize} onChange={(v) => set('bodySize', v)} />
          <TextField label="Body line height" value={tokens.bodyLineHeight} onChange={(v) => set('bodyLineHeight', v)} hint="E.g. 1.75" />
        </Section>
        <Section title="Layout">
          <TextField label="Border radius" value={tokens.borderRadius} onChange={(v) => set('borderRadius', v)} hint="E.g. 6px or 0.375rem" />
          <TextField label="Container max-width" value={tokens.containerMaxWidth} onChange={(v) => set('containerMaxWidth', v)} hint="E.g. 1200px" />
        </Section>
        <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Design'}
          </button>
          {saved && <span style={{ color: '#15803d', alignSelf: 'center' }}>Saved ✓</span>}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '2rem' }}>
      <h2 style={{ fontSize: '0.9375rem', fontWeight: 600, margin: '0 0 1rem', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '0.5rem' }}>{title}</h2>
      {children}
    </div>
  )
}

function ColorField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input type="color" value={value.startsWith('#') ? value : '#ffffff'} onChange={(e) => onChange(e.target.value)} style={{ width: 36, height: 36, padding: 2, border: '1px solid #e5e7eb', borderRadius: 4, cursor: 'pointer', flexShrink: 0 }} />
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="#000000 or var(--color-primary)" />
      </div>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  )
}

function TextField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="field-hint">{hint}</span>}
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
