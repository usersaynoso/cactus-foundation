'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { Data } from '@puckeditor/core'
import Link from 'next/link'
import { useAdminPath } from '@/components/admin/AdminPathContext'
import DisplayConditionsModal from './DisplayConditionsModal'

const LayoutPuckEditor = dynamic(() => import('./LayoutPuckEditor'), {
  ssr: false,
  loading: () => <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#6b7280' }}>Loading layout editor…</div>,
})

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
  const [showConditions, setShowConditions] = useState(false)
  const [conditionsMode, setConditionsMode] = useState<'publish' | 'edit'>('publish')
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

  const handlePublishClick = useCallback((data: Data) => {
    latestDataRef.current = data
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
    setConditionsMode('publish')
    setShowConditions(true)
  }, [])

  const handleConditionsButtonClick = useCallback(() => {
    setConditionsMode('edit')
    setShowConditions(true)
  }, [])

  const handleConditionsSave = useCallback(async (conditions: unknown) => {
    setShowConditions(false)
    setSaving(true)
    try {
      const data = latestDataRef.current
      const body: Record<string, unknown> = { displayConditions: conditions }
      if (conditionsMode === 'publish') {
        body.builderData = data
        body.status = 'published'
      }
      await fetch(`/api/admin/layouts/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setLayout((l) => l ? { ...l, displayConditions: conditions, ...(conditionsMode === 'publish' ? { status: 'published' } : {}) } : l)
      setSaved(true)
    } catch { setError(conditionsMode === 'publish' ? 'Publish failed' : 'Failed to save conditions') }
    finally { setSaving(false) }
  }, [id, conditionsMode])

  if (loading) return <div style={{ padding: '2rem', color: '#6b7280' }}>Loading…</div>
  if (!layout) return <div style={{ padding: '2rem', color: '#dc2626' }}>{error || 'Layout not found'}</div>

  const initialData: Data = (layout.builderData as Data | null) ?? { content: [], root: { props: {} }, zones: {} }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem 1rem', background: 'var(--admin-bg-subtle)', borderBottom: '1px solid var(--color-border)', fontSize: '0.8125rem', color: 'var(--color-muted)', flexShrink: 0 }}>
        <Link href={`/${adminPath}/layouts`} style={{ color: 'var(--color-muted)', textDecoration: 'none' }}>← Theme Builder</Link>
        <span style={{ color: 'var(--color-border)' }}>|</span>
        <span style={{ fontWeight: 500, color: 'var(--color-fg)' }}>{layout.name}</span>
        <TypeBadge type={layout.type} />
        {layout.status === 'published' && <span className="badge badge-green" style={{ padding: '0.125rem 0.5rem', borderRadius: 4, fontWeight: 500 }}>Published</span>}
        {layout.status === 'draft' && <span className="badge badge-yellow" style={{ padding: '0.125rem 0.5rem', borderRadius: 4, fontWeight: 500 }}>Draft</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {saving && <span>Saving…</span>}
          {!saving && saved && <span style={{ color: '#15803d' }}>Saved ✓</span>}
          {error && <span style={{ color: '#dc2626' }}>{error}</span>}
          <button
            onClick={handleConditionsButtonClick}
            style={{ padding: '0.25rem 0.625rem', background: 'none', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: '0.75rem', color: 'var(--color-muted)', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Conditions
          </button>
        </span>
      </div>
      <LayoutPuckEditor
        initialData={initialData}
        onChange={handleChange}
        onPublish={handlePublishClick}
        isPublishing={saving}
        layoutType={layout.type}
      />
      {showConditions && (
        <DisplayConditionsModal
          layoutType={layout.type}
          existing={layout.displayConditions}
          mode={conditionsMode}
          onSave={handleConditionsSave}
          onCancel={() => setShowConditions(false)}
        />
      )}
    </div>
  )
}

function TypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    header: 'Header', footer: 'Footer', infoPage: 'Page Layout',
    notFound: '404', statusPage: 'Status Page',
  }
  return (
    <span style={{ background: '#f3f4f6', color: '#374151', padding: '0.125rem 0.5rem', borderRadius: 4, fontSize: '0.75rem' }}>
      {labels[type] ?? type}
    </span>
  )
}
