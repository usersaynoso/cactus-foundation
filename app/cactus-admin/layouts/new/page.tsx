'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAdminPath } from '@/components/admin/AdminPathContext'

type LayoutTypeOption = {
  key: string
  label: string
  description: string
  icon: string
}

type Starter = {
  key: string
  name: string
  description: string
  builderData: object
}

const LAYOUT_TYPES: LayoutTypeOption[] = [
  { key: 'header',     label: 'Header',                    description: 'Site-wide header bar with logo and navigation.', icon: '▬' },
  { key: 'footer',     label: 'Footer',                    description: 'Site-wide footer with links and copyright.', icon: '▁' },
  { key: 'infoPage',   label: 'Page Layout',               description: 'Body shell with a content slot for page content.', icon: '▣' },
  { key: 'notFound',   label: '404 Page',                  description: 'Shown when a page cannot be found.', icon: '?' },
  { key: 'statusPage', label: 'Coming Soon / Maintenance', description: 'Standalone status screen shown before launch or during maintenance.', icon: '⚐' },
]

const STARTERS_BY_TYPE: Record<string, Starter[]> = {
  header: [
    {
      key: 'blank',
      name: 'Blank',
      description: 'Start from scratch.',
      builderData: { content: [], root: { props: {} }, zones: {} },
    },
    {
      key: 'logo-nav-right',
      name: 'Logo Left + Nav Right',
      description: 'Standard header with logo on the left and navigation on the right.',
      builderData: {
        content: [{ type: 'Row', props: { id: 'cols-1', justify: 'between', align: 'center', gap: 'lg', padding: 'none' } }],
        root: { props: { height: '64px', sticky: 'yes', borderBottom: 'show', maxWidth: '1200px' } },
        zones: {
          'cols-1:items': [{ type: 'SiteLogo', props: { id: 'logo-1' } }, { type: 'MenuBlock', props: { id: 'menu-1' } }],
        },
      },
    },
    {
      key: 'logo-centred-nav',
      name: 'Logo + Centred Nav',
      description: 'Logo on the left with navigation centred across the header.',
      builderData: {
        content: [{ type: 'Row', props: { id: 'cols-1', justify: 'between', align: 'center', gap: 'lg', padding: 'none' } }],
        root: { props: { height: '64px', sticky: 'yes', borderBottom: 'show', maxWidth: '1200px' } },
        zones: {
          'cols-1:items': [{ type: 'SiteLogo', props: { id: 'logo-1' } }, { type: 'MenuBlock', props: { id: 'menu-1' } }],
        },
      },
    },
  ],
  footer: [
    {
      key: 'blank',
      name: 'Blank',
      description: 'Start from scratch.',
      builderData: { content: [], root: { props: {} }, zones: {} },
    },
    {
      key: 'standard',
      name: 'Standard Footer',
      description: 'Simple copyright line centred at the bottom.',
      builderData: {
        content: [{ type: 'Copyright', props: { id: 'copyright-1', prefix: '©', yearFormat: 'current', showSiteName: 'true', alignment: 'center', fontSize: 'small' } }],
        root: { props: { paddingY: 'md', borderTop: 'show' } },
        zones: {},
      },
    },
  ],
  infoPage: [
    {
      key: 'full-width',
      name: 'Full Width',
      description: 'Content fills the full width.',
      builderData: { content: [{ type: 'ContentSlot', props: { id: 'content-slot-1' } }], root: { props: {} }, zones: {} },
    },
    {
      key: 'boxed',
      name: 'Boxed (centred)',
      description: 'Content centred with a max-width — good for articles.',
      builderData: {
        content: [{ type: 'Section', props: { id: 'section-1', paddingY: 'md', maxWidth: 'standard', bgType: 'none' } }],
        root: { props: {} },
        zones: { 'section-1:content': [{ type: 'ContentSlot', props: { id: 'content-slot-1' } }] },
      },
    },
    {
      key: 'right-sidebar',
      name: 'Right Sidebar (70/30)',
      description: 'Main content (70%) with a sidebar on the right (30%).',
      builderData: {
        content: [{ type: 'Split', props: { id: 'columns-1', ratio: '70/30', padding: 'none' } }],
        root: { props: {} },
        zones: { 'columns-1:left': [{ type: 'ContentSlot', props: { id: 'content-slot-1' } }], 'columns-1:right': [] },
      },
    },
    {
      key: 'left-sidebar',
      name: 'Left Sidebar (30/70)',
      description: 'Sidebar on the left (30%), main content on the right (70%).',
      builderData: {
        content: [{ type: 'Split', props: { id: 'columns-1', ratio: '30/70', padding: 'none' } }],
        root: { props: {} },
        zones: { 'columns-1:left': [], 'columns-1:right': [{ type: 'ContentSlot', props: { id: 'content-slot-1' } }] },
      },
    },
  ],
  notFound: [
    {
      key: 'blank',
      name: 'Blank',
      description: 'Start from scratch.',
      builderData: { content: [], root: { props: {} }, zones: {} },
    },
    {
      key: 'centred',
      name: 'Centred message',
      description: 'Centred 404 message with a link back home.',
      builderData: {
        content: [{ type: 'Heading', props: { id: 'h1', text: '404 — Page not found', level: '1', align: 'center' } }, { type: 'ButtonLink', props: { id: 'cta', label: 'Back to home', href: '/' } }],
        root: { props: {} },
        zones: {},
      },
    },
  ],
  statusPage: [
    {
      key: 'blank',
      name: 'Blank',
      description: 'Start from scratch.',
      builderData: { content: [], root: { props: {} }, zones: {} },
    },
    {
      key: 'centred',
      name: 'Centred message',
      description: 'Centred status message.',
      builderData: {
        content: [{ type: 'Heading', props: { id: 'h1', text: 'Coming soon', level: '1', align: 'center' } }],
        root: { props: {} },
        zones: {},
      },
    },
  ],
}

export default function NewLayoutPage() {
  const router = useRouter()
  const adminPath = useAdminPath()
  const [step, setStep] = useState<1 | 2>(1)
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [selectedStarter, setSelectedStarter] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  function handleTypeSelect(key: string) {
    setSelectedType(key)
    setSelectedStarter(null)
    setStep(2)
  }

  async function handleCreate() {
    if (!name.trim()) { setError('Please enter a name'); return }
    if (!selectedStarter) { setError('Please choose a starting structure'); return }
    const starters = STARTERS_BY_TYPE[selectedType ?? 'infoPage'] ?? []
    const starter = starters.find(s => s.key === selectedStarter)
    if (!starter) return
    setCreating(true); setError('')
    try {
      const res = await fetch('/api/admin/layouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), type: selectedType, builderData: starter.builderData }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed to create'); setCreating(false); return }
      const layout = await res.json()
      router.push(`/${adminPath}/layouts/${layout.id}`)
    } catch { setError('Failed to create layout'); setCreating(false) }
  }

  if (step === 1) {
    return (
      <div style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.5rem' }}>New Layout</h1>
        <p style={{ color: '#6b7280', margin: '0 0 2rem' }}>What kind of layout do you want to create?</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
          {LAYOUT_TYPES.map(t => (
            <button
              key={t.key}
              onClick={() => handleTypeSelect(t.key)}
              style={{
                textAlign: 'left', padding: '1.25rem', border: '1px solid #e5e7eb',
                borderRadius: 8, background: '#ffffff', cursor: 'pointer', fontFamily: 'inherit',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#16a34a'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 0 3px rgba(22,163,74,0.1)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none' }}
            >
              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{t.icon}</div>
              <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#111827', marginBottom: '0.25rem' }}>{t.label}</div>
              <div style={{ fontSize: '0.8125rem', color: '#6b7280' }}>{t.description}</div>
            </button>
          ))}
        </div>

        <div style={{ marginTop: '1.5rem' }}>
          <button className="btn btn-secondary" onClick={() => router.back()}>Cancel</button>
        </div>
      </div>
    )
  }

  const typeOption = LAYOUT_TYPES.find(t => t.key === selectedType)
  const starters = STARTERS_BY_TYPE[selectedType ?? 'infoPage'] ?? []

  return (
    <div style={{ maxWidth: 640 }}>
      <button onClick={() => setStep(1)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '0.875rem', padding: 0, marginBottom: '1.5rem', fontFamily: 'inherit' }}>
        ← Back to type selection
      </button>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.25rem' }}>New {typeOption?.label}</h1>
      <p style={{ color: '#6b7280', margin: '0 0 2rem' }}>Give it a name and choose a starting structure.</p>

      <div className="field">
        <label>Layout name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={`e.g. ${typeOption?.label ?? 'My Layout'}`} autoFocus />
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ fontSize: '0.875rem', fontWeight: 500, display: 'block', marginBottom: '0.75rem' }}>Starting structure</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
          {starters.map(s => (
            <button key={s.key} onClick={() => setSelectedStarter(s.key)} style={{
              textAlign: 'left', padding: '1rem', border: selectedStarter === s.key ? '2px solid #16a34a' : '1px solid #e5e7eb',
              borderRadius: 8, background: selectedStarter === s.key ? '#f0fdf4' : '#ffffff', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827' }}>{s.name}</div>
              <div style={{ fontSize: '0.8125rem', color: '#6b7280', marginTop: '0.25rem' }}>{s.description}</div>
            </button>
          ))}
        </div>
      </div>

      {error && <p style={{ color: '#dc2626', fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</p>}

      <div style={{ display: 'flex', gap: '1rem' }}>
        <button className="btn btn-primary" onClick={handleCreate} disabled={creating || !selectedStarter || !name.trim()}>
          {creating ? 'Creating…' : 'Create Layout'}
        </button>
        <button className="btn btn-secondary" onClick={() => router.back()} disabled={creating}>Cancel</button>
      </div>
    </div>
  )
}
