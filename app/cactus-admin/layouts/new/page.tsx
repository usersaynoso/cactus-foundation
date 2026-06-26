'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAdminPath } from '@/components/admin/AdminPathContext'

type Starter = {
  key: string
  name: string
  description: string
  builderData: object
}

const STARTERS: Starter[] = [
  {
    key: 'full-width',
    name: 'Full Width',
    description: 'Content fills the full width. No sidebar, no max-width constraint.',
    builderData: {
      content: [{ type: 'ContentSlot', props: {}, readOnly: false }],
      root: { props: {} },
      zones: {},
    },
  },
  {
    key: 'boxed',
    name: 'Boxed (centred)',
    description: 'Content centred with a max-width of 900px — good for articles and landing pages.',
    builderData: {
      content: [{ type: 'Section', props: { paddingY: 'md', maxWidth: 'standard', bgType: 'none', content: { type: 'ContentSlot', props: {} } }, readOnly: false }],
      root: { props: {} },
      zones: {},
    },
  },
  {
    key: 'right-sidebar',
    name: 'Right Sidebar (70/30)',
    description: 'Main content on the left (70%), sidebar on the right (30%).',
    builderData: {
      content: [{
        type: 'Columns', props: { ratio: '70/30', padding: 'none' },
        readOnly: false,
      }],
      root: { props: {} },
      zones: {
        'root:content': [{ type: 'Columns', props: { ratio: '70/30', padding: 'none' } }],
        'Columns-0:left': [{ type: 'ContentSlot', props: {} }],
        'Columns-0:right': [],
      },
    },
  },
  {
    key: 'left-sidebar',
    name: 'Left Sidebar (30/70)',
    description: 'Sidebar on the left (30%), main content on the right (70%).',
    builderData: {
      content: [{ type: 'Columns', props: { ratio: '30/70', padding: 'none' }, readOnly: false }],
      root: { props: {} },
      zones: {
        'Columns-0:left': [],
        'Columns-0:right': [{ type: 'ContentSlot', props: {} }],
      },
    },
  },
]

export default function NewLayoutPage() {
  const router = useRouter()
  const adminPath = useAdminPath()
  const [selected, setSelected] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate() {
    if (!name.trim()) { setError('Please enter a name'); return }
    if (!selected) { setError('Please choose a starting structure'); return }
    const starter = STARTERS.find((s) => s.key === selected)
    if (!starter) return
    setCreating(true); setError('')
    try {
      const res = await fetch('/api/admin/layouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), builderData: starter.builderData }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed to create'); setCreating(false); return }
      const layout = await res.json()
      router.push(`/${adminPath}/layouts/${layout.id}`)
    } catch { setError('Failed to create layout'); setCreating(false) }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.5rem' }}>New Layout</h1>
      <p style={{ color: '#6b7280', margin: '0 0 2rem' }}>Choose a starting structure, then customise it in the editor.</p>

      <div className="field">
        <label>Layout name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard Article" autoFocus />
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ fontSize: '0.875rem', fontWeight: 500, display: 'block', marginBottom: '0.75rem' }}>Starting structure</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
          {STARTERS.map((s) => (
            <button key={s.key} onClick={() => setSelected(s.key)} style={{
              textAlign: 'left', padding: '1rem', border: selected === s.key ? '2px solid #16a34a' : '1px solid #e5e7eb',
              borderRadius: 8, background: selected === s.key ? '#f0fdf4' : '#ffffff', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <StructureDiagram key={s.key} name={s.key} />
              <div style={{ fontWeight: 600, fontSize: '0.875rem', marginTop: '0.5rem', color: '#111827' }}>{s.name}</div>
              <div style={{ fontSize: '0.8125rem', color: '#6b7280', marginTop: '0.25rem' }}>{s.description}</div>
            </button>
          ))}
        </div>
      </div>

      {error && <p style={{ color: '#dc2626', fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</p>}

      <div style={{ display: 'flex', gap: '1rem' }}>
        <button className="btn btn-primary" onClick={handleCreate} disabled={creating || !selected || !name.trim()}>
          {creating ? 'Creating…' : 'Create Layout'}
        </button>
        <button className="btn btn-secondary" onClick={() => router.back()} disabled={creating}>Cancel</button>
      </div>
    </div>
  )
}

function StructureDiagram({ name }: { name: string }) {
  const h = 40
  if (name === 'full-width') return <div style={{ height: h, background: '#dbeafe', borderRadius: 3 }} />
  if (name === 'boxed') return <div style={{ display: 'flex', justifyContent: 'center', height: h }}><div style={{ width: '70%', background: '#dbeafe', borderRadius: 3 }} /></div>
  if (name === 'right-sidebar') return <div style={{ display: 'flex', gap: 4, height: h }}><div style={{ flex: 7, background: '#dbeafe', borderRadius: 3 }} /><div style={{ flex: 3, background: '#f3f4f6', borderRadius: 3 }} /></div>
  if (name === 'left-sidebar') return <div style={{ display: 'flex', gap: 4, height: h }}><div style={{ flex: 3, background: '#f3f4f6', borderRadius: 3 }} /><div style={{ flex: 7, background: '#dbeafe', borderRadius: 3 }} /></div>
  return <div style={{ height: h, background: '#dbeafe', borderRadius: 3 }} />
}
