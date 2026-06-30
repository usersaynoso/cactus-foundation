'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { Data } from '@puckeditor/core'
import Link from 'next/link'
import { useAdminPath } from '@/components/admin/AdminPathContext'
import DisplayConditionsPanel from './DisplayConditionsPanel'

const LayoutPuckEditor = dynamic(() => import('./LayoutPuckEditor'), {
  ssr: false,
  loading: () => <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--color-text-muted)' }}>Loading layout editor…</div>,
})

type DisplayConditions = { include: unknown[]; exclude: unknown[] }

type Layout = {
  id: string
  name: string
  type: string
  status: string
  builderData: Data | null
  displayConditions: unknown
}

export default function LayoutEditorPage() {
  const { id } = useParams<{ id: string }>()
  const adminPath = useAdminPath()
  const [layout, setLayout] = useState<Layout | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestDataRef = useRef<Data | null>(null)

  useEffect(() => {
    fetch(`/api/admin/layouts/${id}`)
      .then((r) => r.json())
      .then((d) => { setLayout(d); setLoading(false) })
      .catch(() => { setError('Failed to load layout'); setLoading(false) })
  }, [id])

  const handleChange = useCallback((data: Data) => {
    latestDataRef.current = data
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSaving(true); setSaved(false)
      try {
        const res = await fetch(`/api/admin/layouts/${id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ builderData: data }),
        })
        if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Save failed') }
        else setSaved(true)
      } catch { setError('Autosave failed') }
      finally { setSaving(false) }
    }, 1200)
  }, [id])

  const handlePublish = useCallback(async (data: Data) => {
    const conditions = layout?.displayConditions as DisplayConditions | null
    if (!conditions?.include?.length) {
      setError('Set at least one include rule in Display Conditions before publishing.')
      return
    }
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
    setSaving(true); setSaved(false); setError('')
    try {
      const res = await fetch(`/api/admin/layouts/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ builderData: data, status: 'published' }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Publish failed') }
      else { setLayout((l) => l ? { ...l, status: 'published' } : l); setSaved(true) }
    } catch { setError('Publish failed') }
    finally { setSaving(false) }
  }, [id, layout?.displayConditions])

  const handleConditionsSave = useCallback(async (conditions: DisplayConditions) => {
    setSaving(true); setSaved(false); setError('')
    try {
      const res = await fetch(`/api/admin/layouts/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayConditions: conditions }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed to save conditions') }
      else { setLayout((l) => l ? { ...l, displayConditions: conditions } : l); setSaved(true) }
    } catch { setError('Failed to save conditions') }
    finally { setSaving(false) }
  }, [id])

  if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Loading…</div>
  if (!layout) return <div style={{ padding: '2rem', color: 'var(--color-destructive)' }}>{error || 'Layout not found'}</div>

  const initialData: Data = (layout.builderData as Data | null) ?? { content: [], root: { props: {} }, zones: {} }

  const conditionsPanel = (
    <DisplayConditionsPanel
      key={JSON.stringify(layout.displayConditions)}
      layoutType={layout.type}
      existing={layout.displayConditions}
      onSave={handleConditionsSave}
    />
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem 1rem', background: 'var(--admin-bg-subtle)', borderBottom: '1px solid var(--color-border)', fontSize: '0.8125rem', color: 'var(--color-muted)', flexShrink: 0 }}>
        <Link href={`/${adminPath}/layouts`} style={{ color: 'var(--color-muted)', textDecoration: 'none' }}>← Layout Builder</Link>
        <span style={{ color: 'var(--color-border)' }}>|</span>
        <span style={{ fontWeight: 500, color: 'var(--color-fg)' }}>{layout.name}</span>
        <TypeBadge type={layout.type} />
        {layout.status === 'published' && <span className="badge badge-green" style={{ padding: '0.125rem 0.5rem', borderRadius: 4, fontWeight: 500 }}>Published</span>}
        {layout.status === 'draft' && <span className="badge badge-yellow" style={{ padding: '0.125rem 0.5rem', borderRadius: 4, fontWeight: 500 }}>Draft</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {saving && <span>Saving…</span>}
          {!saving && saved && <span style={{ color: 'var(--color-success)' }}>Saved ✓</span>}
          {error && <span style={{ color: 'var(--color-destructive)' }}>{error}</span>}
        </span>
      </div>
      <LayoutPuckEditor
        initialData={initialData}
        onChange={handleChange}
        onPublish={handlePublish}
        isPublishing={saving}
        layoutType={layout.type}
        conditionsPanel={conditionsPanel}
      />
    </div>
  )
}

function TypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    header: 'Header', footer: 'Footer', infoPage: 'Page Layout',
    notFound: '404', statusPage: 'Status Page',
  }
  return (
    <span className="badge badge-default" style={{ padding: '0.125rem 0.5rem', borderRadius: 4, fontSize: 'var(--text-xs)' }}>
      {labels[type] ?? type}
    </span>
  )
}
