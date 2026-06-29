'use client'

import { useState, useEffect } from 'react'

type SessionInfo = {
  id: string
  createdAt: string
  expiresAt: string
  current: boolean
}

export default function AccountPage() {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exportLoading, setExportLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [newPasskeyLoading, setNewPasskeyLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetch('/api/account/sessions')
      .then((r) => r.json())
      .then((d: { sessions: SessionInfo[] }) => { setSessions(d.sessions ?? []); setLoading(false) })
      .catch(() => { setError('Failed to load sessions'); setLoading(false) })
  }, [])

  async function handleRevokeSession(id: string) {
    const res = await fetch(`/api/account/sessions/${id}`, { method: 'DELETE' })
    if (res.ok) setSessions((s) => s.filter((x) => x.id !== id))
  }

  async function handleRevokeAll() {
    const res = await fetch('/api/account/sessions', { method: 'DELETE' })
    if (res.ok) window.location.href = '/'
  }

  async function handleExport() {
    setExportLoading(true)
    try {
      const res = await fetch('/api/account/export')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'my-data.json'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Export failed')
    } finally {
      setExportLoading(false)
    }
  }

  async function handleDeleteAccount() {
    const res = await fetch('/api/account', { method: 'DELETE' })
    const d = await res.json()
    if (!res.ok) {
      setError(d.error ?? 'Deletion failed')
      setDeleteConfirm(false)
    } else {
      window.location.href = '/'
    }
  }

  async function handleAddPasskey() {
    setNewPasskeyLoading(true)
    setError('')
    try {
      const { startRegistration } = await import('@simplewebauthn/browser')
      const optRes = await fetch('/api/auth/passkey/register-options', { method: 'POST' })
      if (!optRes.ok) {
        const d = await optRes.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error ?? 'Failed to get registration options')
      }
      const opts = await optRes.json()
      const attestation = await startRegistration({ optionsJSON: opts })
      const verifyRes = await fetch('/api/auth/passkey/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attestation }),
      })
      if (!verifyRes.ok) {
        const d = await verifyRes.json()
        throw new Error(d.error ?? 'Passkey registration failed')
      }
      setMessage('New passkey registered successfully.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setNewPasskeyLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="page-header">
        <h1 className="page-title">Account settings</h1>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      {/* Passkeys */}
      <div className="card">
        <h2 className="card-title">Passkeys</h2>
        <button
          className="btn btn-secondary"
          disabled={newPasskeyLoading}
          onClick={handleAddPasskey}
        >
          {newPasskeyLoading ? 'Registering…' : '+ Add a new passkey'}
        </button>
      </div>

      {/* Active sessions */}
      <div className="card">
        <h2 className="card-title">Active sessions</h2>
        {loading ? <p>Loading…</p> : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              {sessions.map((s) => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9375rem' }}>
                  <div>
                    <span>Session started {new Date(s.createdAt).toLocaleDateString()}</span>
                    {s.current && <span className="badge badge-blue" style={{ marginLeft: '0.5rem' }}>Current</span>}
                  </div>
                  {!s.current && (
                    <button className="btn btn-secondary btn-sm" onClick={() => handleRevokeSession(s.id)}>Revoke</button>
                  )}
                </div>
              ))}
            </div>
            <button className="btn btn-danger btn-sm" onClick={handleRevokeAll}>
              Sign out everywhere
            </button>
          </>
        )}
      </div>

      {/* Data export */}
      <div className="card">
        <h2 className="card-title">Your data</h2>
        <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-muted)', margin: '0 0 1rem' }}>
          Download a JSON export of your profile, passkey metadata, and active sessions.
        </p>
        <button className="btn btn-secondary" disabled={exportLoading} onClick={handleExport}>
          {exportLoading ? 'Preparing…' : 'Download my data'}
        </button>
      </div>

      {/* Delete account */}
      <div className="card" style={{ borderColor: 'var(--color-destructive-border)' }}>
        <h2 className="card-title" style={{ color: 'var(--color-destructive)' }}>Delete account</h2>
        <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-muted)', margin: '0 0 1rem' }}>
          Permanent and immediate. Your content will remain but will be attributed to a deleted user.
        </p>
        {!deleteConfirm ? (
          <button className="btn btn-danger" onClick={() => setDeleteConfirm(true)}>Delete my account</button>
        ) : (
          <div className="alert alert-danger">
            <p style={{ margin: '0 0 0.75rem' }}>Are you sure? This cannot be undone.</p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-danger btn-sm" onClick={handleDeleteAccount}>Yes, delete</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setDeleteConfirm(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
