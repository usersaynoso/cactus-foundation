'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { Data } from '@puckeditor/core'
import Link from 'next/link'
import { useAdminPath } from '@/components/admin/AdminPathContext'

const LayoutPuckEditor = dynamic(() => import('./LayoutPuckEditor'), {
  ssr: false,
  loading: () => <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#6b7280' }}>Loading layout editor…</div>,
})

export default function LayoutEditorPage() {
  const { id } = useParams<{ id: string }>()
  const adminPath = useAdminPath()
  const router = useRouter()
  const [layout, setLayout] = useState<{ id: string; name: string; status: string; builderData: Data | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch(`/api/admin/layouts/${id}`)
      .then((r) => r.json())
      .then((d) => { setLayout(d); setLoading(false) })
      .catch(() => { setError('Failed to load layout'); setLoading(false) })
  }, [id])

  const handleChange = useCallback((data: Data) => {
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
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
    setPublishing(true)
    try {
      await fetch(`/api/admin/layouts/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ builderData: data, status: 'published' }),
      })
      await fetch(`/api/admin/layouts/${id}/publish`, { method: 'POST' })
      setLayout((l) => l ? { ...l, status: 'published' } : l)
      setSaved(true)
    } catch { setError('Publish failed') }
    finally { setPublishing(false) }
  }, [id])

  if (loading) return <div style={{ padding: '2rem', color: '#6b7280' }}>Loading…</div>
  if (!layout) return <div style={{ padding: '2rem', color: '#dc2626' }}>{error || 'Layout not found'}</div>

  const initialData: Data = (layout.builderData as Data | null) ?? { content: [], root: { props: {} }, zones: {} }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem 1rem', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '0.8125rem', color: '#6b7280', flexShrink: 0 }}>
        <Link href={`/${adminPath}/layouts`} style={{ color: '#6b7280', textDecoration: 'none' }}>← Layouts</Link>
        <span style={{ color: '#e5e7eb' }}>|</span>
        <span style={{ fontWeight: 500, color: '#111827' }}>{layout.name}</span>
        {layout.status === 'published' && <span style={{ background: '#dcfce7', color: '#15803d', padding: '0.125rem 0.5rem', borderRadius: 4, fontWeight: 500 }}>Published</span>}
        {layout.status === 'draft' && <span style={{ background: '#fef9c3', color: '#a16207', padding: '0.125rem 0.5rem', borderRadius: 4, fontWeight: 500 }}>Draft</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {saving && <span>Saving…</span>}
          {!saving && saved && <span style={{ color: '#15803d' }}>Saved ✓</span>}
          {error && <span style={{ color: '#dc2626' }}>{error}</span>}
        </span>
      </div>
      <LayoutPuckEditor initialData={initialData} onChange={handleChange} onPublish={handlePublish} isPublishing={publishing} />
    </div>
  )
}
