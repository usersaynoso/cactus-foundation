'use client'

import { useEffect, useState } from 'react'

type ExportRequest = { id: string; status: 'PENDING' | 'PROCESSING' | 'READY' | 'EXPIRED'; createdAt: string; expiresAt: string | null } | null

export default function DangerZoneSection() {
  const [exportRequest, setExportRequest] = useState<ExportRequest>(null)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [scheduledAt, setScheduledAt] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/members/data-export').then((r) => r.json()).then((d) => setExportRequest(d.request))
  }, [])

  async function requestExport() {
    setExporting(true)
    setError('')
    try {
      const res = await fetch('/api/members/data-export', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Export failed')
      const statusRes = await fetch('/api/members/data-export')
      setExportRequest((await statusRes.json()).request)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  async function downloadExport() {
    const res = await fetch('/api/members/data-export/download')
    if (!res.ok) {
      setError('Download failed')
      return
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'cactus-data-export.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function requestDeletion() {
    setDeleting(true)
    setError('')
    try {
      const res = await fetch('/api/members/delete-account', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to request deletion')
      setScheduledAt(d.scheduledAt)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to request deletion')
    } finally {
      setDeleting(false)
    }
  }

  const canRequestExport = !exportRequest || exportRequest.status === 'EXPIRED'
  const isExportInFlight = exportRequest?.status === 'PENDING' || exportRequest?.status === 'PROCESSING'

  return (
    <div>
      <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-semibold)', margin: '0 0 var(--space-4)', color: 'var(--color-text)' }}>
        Danger zone
      </h2>

      {error && <div className="alert alert-danger">{error}</div>}

      <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: '0 0 var(--space-2)', color: 'var(--color-text)' }}>Export your data</h3>
      {exportRequest?.status === 'READY' && (
        <p>
          Your export is ready.{' '}
          <button className="btn btn-link" onClick={downloadExport}>Download it</button>{' '}
          before {exportRequest.expiresAt && new Date(exportRequest.expiresAt).toLocaleString()}.
        </p>
      )}
      {isExportInFlight && <p className="field-hint">Your export is being prepared - check back shortly.</p>}
      <button className="btn btn-secondary" disabled={exporting || isExportInFlight || !canRequestExport} onClick={requestExport}>
        {exporting ? 'Requesting…' : 'Request data export'}
      </button>

      <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 'var(--space-6) 0 var(--space-2)', color: 'var(--color-text)' }}>Delete account</h3>
      {scheduledAt ? (
        <div className="alert alert-success">
          Your account is scheduled for deletion on {new Date(scheduledAt).toLocaleDateString()}. You can cancel this any time before then from the banner at the top of your account.
        </div>
      ) : !confirmDelete ? (
        <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
          Delete my account
        </button>
      ) : (
        <div>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            This schedules your account for deletion after a grace period. You can cancel any time before then.
          </p>
          <button className="btn btn-danger" disabled={deleting} onClick={requestDeletion}>
            {deleting ? 'Requesting…' : 'Confirm deletion'}
          </button>
          <button className="btn btn-secondary" style={{ marginLeft: 'var(--space-2)' }} onClick={() => setConfirmDelete(false)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
