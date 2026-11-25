'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { Data } from '@puckeditor/core'
import { useAdminPath } from '@/components/admin/AdminPathContext'
import { isCompleteRule, type ConditionRule, type DisplayConditions } from '@/lib/layout/displayConditions'
import { useAdminConfirm } from '@/components/admin/useAdminConfirm'

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
  const router = useRouter()
  const adminPath = useAdminPath()
  const [askConfirm, confirmNode] = useAdminConfirm()
  const [layout, setLayout] = useState<Layout | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const latestDataRef = useRef<Data | null>(null)
  // beforeunload has to read the flag at the moment the browser asks, not the
  // value React had when the listener last re-registered - see markUnsaved.
  const unsavedRef = useRef(false)

  const markUnsaved = useCallback((next: boolean) => {
    unsavedRef.current = next
    setHasUnsavedChanges(next)
  }, [])

  const [historyVersions, setHistoryVersions] = useState<HistoryVersion[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [restoringIndex, setRestoringIndex] = useState<'live' | number | null>(null)

  useEffect(() => {
    fetch(`/api/admin/layouts/${id}`)
      // A refusal or a missing layout answers { error } - without the ok check that
      // object became `layout` and the builder opened blank on a layout of no type.
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error((d as { error?: string }).error ?? 'Failed to load layout')
        return d as Layout
      })
      .then((d) => { setLayout(d); setLoading(false) })
      .catch((err: unknown) => { setError(err instanceof Error ? err.message : 'Failed to load layout'); setLoading(false) })
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

  // Content only saves to the DB on an explicit Update click - warn on a real
  // browser navigation/reload/close so in-progress edits aren't silently lost
  // (the in-app "Back to Layouts" link is a client-side nav, which this can't
  // catch - see its own confirm() in headerBackLinkOverride.tsx). It reads the
  // ref so that a restore, which clears the flag and reloads in the same tick,
  // doesn't race the listener into warning about changes it just discarded.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (unsavedRef.current) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  const handleRestore = useCallback(async (index: 'live' | number) => {
    // Ask before spending the round-trip, not after it: the old order fetched
    // the whole version blob and only then popped the "are you sure".
    const live = layout?.status === 'published'
    const ok = await askConfirm(live
      ? { title: 'Restore this version?', message: 'It goes live immediately, and the version it replaces is kept in this list.', confirmLabel: 'Restore', danger: false }
      : { title: 'Load this version into the editor?', message: 'Your current unsaved changes will be replaced.', confirmLabel: 'Load it', danger: false })
    if (!ok) return

    setRestoringIndex(index)
    setHistoryError('')
    try {
      const res = await fetch(`/api/admin/layouts/${id}/history?index=${index}`)
      const d = await res.json()
      if (!res.ok || !d.data) {
        setHistoryError(d.error ?? 'Failed to load version')
        setRestoringIndex(null)
        return
      }
      // A layout has one content blob, and the site renders it - so restoring a
      // published layout IS publishing. Route it through the publish path or the
      // restored content goes live while the History tab still swears the old
      // version is the live one, and the version just replaced is lost for good.
      const patchRes = await fetch(`/api/admin/layouts/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ builderData: d.data, ...(live ? { status: 'published' } : {}) }),
      })
      if (!patchRes.ok) {
        const pd = await patchRes.json().catch(() => ({}))
        setHistoryError(pd.error ?? 'Failed to restore version')
        setRestoringIndex(null)
        return
      }
      // The reload is what gets the restored content into Puck. Drop the dirty
      // flag first or beforeunload greets the owner with a browser "leave site?"
      // box for changes they just chose to discard.
      markUnsaved(false)
      window.location.reload()
    } catch {
      setHistoryError('Failed to restore version')
      setRestoringIndex(null)
    }
  }, [id, layout?.status, markUnsaved, askConfirm])

  const handleChange = useCallback((data: Data) => {
    latestDataRef.current = data
    markUnsaved(true)
  }, [markUnsaved])

  const handlePublish = useCallback(async (data: Data) => {
    // Settings tab status is set to Draft — honour it: save content only, don't force live.
    if (layout?.status === 'draft') {
      setSaving(true); setSaved(false); setError('')
      try {
        const res = await fetch(`/api/admin/layouts/${id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ builderData: data }),
        })
        if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Save failed') }
        else { setSaved(true); markUnsaved(false) }
      } catch { setError('Save failed') }
      finally { setSaving(false) }
      return
    }

    // Same bar the API sets: a half-filled rule shows the layout on nothing, so
    // it is not something to publish onto.
    const conditions = layout?.displayConditions as DisplayConditions | null
    const usable = (conditions?.include ?? []).filter((r): r is ConditionRule => !!r && typeof r === 'object').some(isCompleteRule)
    if (!usable) {
      setError('Set at least one complete include rule in Display Conditions before publishing.')
      return
    }
    setSaving(true); setSaved(false); setError('')
    try {
      const res = await fetch(`/api/admin/layouts/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ builderData: data, status: 'published' }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Publish failed') }
      else { setLayout((l) => l ? { ...l, status: 'published' } : l); setSaved(true); markUnsaved(false); loadHistory() }
    } catch { setError('Publish failed') }
    finally { setSaving(false) }
  }, [id, layout?.status, layout?.displayConditions, loadHistory, markUnsaved])

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

  const handleDeleteClick = useCallback(() => setDeleteConfirm(true), [])

  const handleDelete = useCallback(async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/layouts/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Failed to delete')
      }
      router.push(`/${adminPath}/layouts`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
      setDeleting(false)
    }
  }, [id, adminPath, router])

  if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Loading…</div>
  if (!layout) return <div style={{ padding: '2rem', color: 'var(--color-destructive)' }}>{error || 'Layout not found'}</div>

  const initialData: Data = (layout.builderData as Data | null) ?? { content: [], root: { props: {} }, zones: {} }

  return (
    <>
      {confirmNode}
      {deleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10001,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-8)', maxWidth: 400, width: '90%' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>Delete this layout?</h3>
            {error && <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => { setDeleteConfirm(false); setError('') }}>Cancel</button>
              <button className="btn btn-danger" disabled={deleting} onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <LayoutPuckEditor
        initialData={initialData}
        onChange={handleChange}
        onPublish={handlePublish}
        isPublishing={saving}
        hasUnsavedChanges={hasUnsavedChanges}
        layoutType={layout.type}
        backHref={`/${adminPath}/layouts`}
        layoutId={layout.id}
        onDeleteClick={handleDeleteClick}
        deleting={deleting}
        canDelete
        name={layout.name}
        description={layout.description}
        priority={layout.priority}
        status={layout.status}
        onSettingsSave={handleSettingsSave}
        onStatusChange={handleStatusChange}
        saving={saving}
        saved={saved}
        error={error}
        displayConditions={layout.displayConditions}
        onConditionsSave={handleConditionsSave}
        historyVersions={historyVersions}
        historyLoading={historyLoading}
        historyError={historyError}
        restoringIndex={restoringIndex}
        onRestore={handleRestore}
      />
    </>
  )
}
