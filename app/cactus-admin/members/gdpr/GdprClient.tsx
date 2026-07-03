'use client'

import { useEffect, useState } from 'react'
import { useAdminPath } from '@/components/admin/AdminPathContext'
import Link from 'next/link'

type ConsentRecord = { id: string; consentType: string; granted: boolean; createdAt: string; member: { username: string } | null }
type ExportRequest = { id: string; status: string; createdAt: string; expiresAt: string | null; member: { username: string } | null }
type DeletionRequest = { id: string; username: string; deletionRequestedAt: string; deletionScheduledAt: string }
type LogEntry = { id: string; action: string; createdAt: string; member: { username: string } | null }

export default function GdprClient() {
  const adminPath = useAdminPath()
  const [consentRecords, setConsentRecords] = useState<ConsentRecord[]>([])
  const [exportRequests, setExportRequests] = useState<ExportRequest[]>([])
  const [deletionRequests, setDeletionRequests] = useState<DeletionRequest[]>([])
  const [processingLog, setProcessingLog] = useState<LogEntry[]>([])

  useEffect(() => {
    fetch('/api/admin/members/gdpr').then((r) => r.json()).then((d) => {
      setConsentRecords(d.consentRecords ?? [])
      setExportRequests(d.exportRequests ?? [])
      setDeletionRequests(d.deletionRequests ?? [])
      setProcessingLog(d.processingLog ?? [])
    })
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <div className="card">
        <h2 className="card-title">Pending deletion requests</h2>
        {deletionRequests.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>None.</p>}
        {deletionRequests.map((d) => (
          <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--color-border)' }}>
            <Link href={`/${adminPath}/members/${d.id}`}>{d.username}</Link>
            <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
              Requested {new Date(d.deletionRequestedAt).toLocaleDateString()} - scheduled {new Date(d.deletionScheduledAt).toLocaleDateString()}
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 className="card-title">Recent data exports</h2>
        {exportRequests.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>None.</p>}
        {exportRequests.map((e) => (
          <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--color-border)' }}>
            <span>{e.member?.username ?? 'Unknown'} - <span className="badge badge-gray">{e.status}</span></span>
            <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>{new Date(e.createdAt).toLocaleString()}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 className="card-title">Recent consent records</h2>
        {consentRecords.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>None.</p>}
        {consentRecords.map((c) => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--color-border)' }}>
            <span>{c.member?.username ?? 'Unknown'} - {c.consentType} - {c.granted ? 'granted' : 'declined'}</span>
            <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>{new Date(c.createdAt).toLocaleString()}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 className="card-title">Data processing log</h2>
        {processingLog.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>None.</p>}
        {processingLog.map((l) => (
          <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--color-border)' }}>
            <span>{l.member?.username ?? 'Unknown'} - {l.action.replace(/_/g, ' ')}</span>
            <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>{new Date(l.createdAt).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
