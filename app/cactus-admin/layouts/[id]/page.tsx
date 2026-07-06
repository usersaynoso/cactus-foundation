'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { Data } from '@puckeditor/core'
import { useAdminPath } from '@/components/admin/AdminPathContext'
import DisplayConditionsPanel from './DisplayConditionsPanel'
import LayoutSettingsTab from '@/lib/puck/tabs/LayoutSettingsTab'
import PageHistoryTab from '@/lib/puck/tabs/PageHistoryTab'

type HistoryVersion = {
  index: 'live' | number
  at: string | null
  title: string
  byName: string | null
  isLive: boolean
}

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
  description: string | null
  priority: number
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

  const [historyVersions, setHistoryVersions] = useState<HistoryVersion[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [restoringIndex, setRestoringIndex] = useState<'live' | number | null>(null)

  useEffect(() => {
    fetch(`/api/admin/layouts/${id}`)
      .then((r) => r.json())
      .then((d) => { setLayout(d); setLoading(false) })
      .catch(() => { setError('Failed to load layout'); setLoading(false) })
  }, [id])

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    setHistoryError('')
    try {
      const res = await fetch(`/api/admin/layouts/${id}/history`)
      const d = await res.json()
      if (!res.ok) setHistoryError(d.error ?? 'Failed to load history')
      else setHistoryVersions(d.versions ?? [])
    } catch {
      setHistoryError('Failed to load history')
    } finally {
      setHistoryLoading(false)
    }
  }, [id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async history load on mount; setLoading(false) only fires after awaits
    loadHistory()
  }, [loadHistory])

  const handleRestore = useCallback(async (index: 'live' | number) => {
    setRestoringIndex(index)
    try {
      const res = await fetch(`/api/admin/layouts/${id}/history?index=${index}`)
      const d = await res.json()
      if (!res.ok || !d.data) {
        setHistoryError(d.error ?? 'Failed to load version')
        setRestoringIndex(null)
        return
      }
      if (!confirm('Load this version into the editor? Your current unsaved changes will be replaced.')) {
        setRestoringIndex(null)
        return
      }
      if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
      const patchRes = await fetch(`/api/admin/layouts/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ builderData: d.data }),
      })
      if (!patchRes.ok) {
        const pd = await patchRes.json()
        setHistoryError(pd.error ?? 'Failed to restore version')
        setRestoringIndex(null)
        return
      }
      window.location.reload()
    } catch {
      setHistoryError('Failed to restore version')
    } finally {
      setRestoringIndex(null)
    }
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
      else { setLayout((l) => l ? { ...l, status: 'published' } : l); setSaved(true); loadHistory() }
    } catch { setError('Publish failed') }
    finally { setSaving(false) }
  }, [id, layout?.displayConditions, loadHistory])

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

  const handleSettingsSave = useCallback(async (patch: { name: string; description: string | null; priority: number }) => {
    setSaving(true); setSaved(false); setError('')
    try {
      const res = await fetch(`/api/admin/layouts/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed to save settings') }
      else { setLayout((l) => l ? { ...l, ...patch } : l); setSaved(true) }
    } catch { setError('Failed to save settings') }
    finally { setSaving(false) }
  }, [id])

  const handleStatusChange = useCallback(async (status: string) => {
    setSaving(true); setSaved(false); setError('')
    try {
      const res = await fetch(`/api/admin/layouts/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed to update status') }
      else { setLayout((l) => l ? { ...l, status } : l); setSaved(true); if (status === 'published') loadHistory() }
    } catch { setError('Failed to update status') }
    finally { setSaving(false) }
  }, [id, loadHistory])

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

  const settingsTab = (
    <LayoutSettingsTab
      key={`${layout.name}-${layout.description}-${layout.priority}`}
      name={layout.name}
      description={layout.description}
      priority={layout.priority}
      status={layout.status}
      onSave={handleSettingsSave}
      onStatusChange={handleStatusChange}
      saving={saving}
      saved={saved}
      error={error}
    />
  )

  const historyTab = (
    <PageHistoryTab
      versions={historyVersions}
      loading={historyLoading}
      error={historyError}
      restoringIndex={restoringIndex}
      onRestore={handleRestore}
    />
  )

  return (
    <LayoutPuckEditor
      initialData={initialData}
      onChange={handleChange}
      onPublish={handlePublish}
      isPublishing={saving}
      layoutType={layout.type}
      backHref={`/${adminPath}/layouts`}
      conditionsPanel={conditionsPanel}
      settingsTab={settingsTab}
      historyTab={historyTab}
    />
  )
}
