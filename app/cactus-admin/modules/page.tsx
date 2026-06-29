'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Metadata } from 'next'
import type { ModuleStatus } from '@prisma/client'

type Module = {
  id: string
  name: string
  repoUrl: string
  version: string
  tablePrefix: string
  status: ModuleStatus
  installedAt: string
  lastError: string | null
  updateAvailable: string | null
  updateNotes: string | null
}

const STATUS_BADGE: Record<ModuleStatus, { label: string; className: string }> = {
  pending_install: { label: 'Pending', className: 'badge-yellow' },
  deploying: { label: 'Deploying', className: 'badge-blue' },
  active: { label: 'Active', className: 'badge-green' },
  inactive: { label: 'Disabled', className: 'badge-gray' },
  failed: { label: 'Failed', className: 'badge-red' },
  update_available: { label: 'Update available', className: 'badge-yellow' },
}

export default function ModulesPage() {
  const [modules, setModules] = useState<Module[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [installing, setInstalling] = useState(false)
  const [repoUrl, setRepoUrl] = useState('')
  const [releaseNotesFor, setReleaseNotesFor] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/modules')
      const d = await res.json()
      setModules(d.modules ?? [])
    } catch {
      setError('Failed to load modules')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleInstall() {
    setError('')
    setInstalling(true)
    try {
      const res = await fetch('/api/admin/modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Install failed')
      setRepoUrl('')
      await load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Install failed')
    } finally {
      setInstalling(false)
    }
  }

  async function handleAction(id: string, action: 'update' | 'enable' | 'disable') {
    setError('')
    try {
      const res = await fetch(`/api/admin/modules/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Action failed')
      await load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed')
    }
  }

  if (loading) return <p>Loading…</p>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Modules</h1>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card" style={{ marginBottom: '2rem' }}>
        <h2 className="card-title">Install a module</h2>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <input
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/owner/cactus-module-name"
            style={{ flex: 1, padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', fontSize: 'var(--text-base)', background: 'var(--color-surface)', color: 'var(--color-text)', fontFamily: 'inherit' }}
          />
          <button
            className="btn btn-primary"
            disabled={!repoUrl || installing}
            onClick={handleInstall}
          >
            {installing ? 'Installing…' : 'Install'}
          </button>
        </div>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: 'var(--space-2) 0 0' }}>
          The module will be added as a git submodule. A Vercel deployment will be triggered automatically.
        </p>
      </div>

      {modules.length === 0 ? (
        <div className="alert alert-info">No modules installed yet.</div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Version</th>
                <th>Table prefix</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {modules.map((m) => (
                <tr key={m.id}>
                  <td>
                    <strong>{m.name}</strong>
                    {m.lastError && <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-destructive)' }}>{m.lastError}</div>}
                  </td>
                  <td>v{m.version}</td>
                  <td><code style={{ fontSize: '0.875rem' }}>{m.tablePrefix}</code></td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[m.status]?.className ?? 'badge-gray'}`}>
                      {STATUS_BADGE[m.status]?.label ?? m.status}
                    </span>
                    {m.updateAvailable && (
                      <span className="badge badge-yellow" style={{ marginLeft: '0.5rem' }}>v{m.updateAvailable}</span>
                    )}
                  </td>
                  <td style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {m.status === 'update_available' && (
                      <>
                        {m.updateNotes && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setReleaseNotesFor(releaseNotesFor === m.id ? null : m.id)}
                          >
                            Release notes
                          </button>
                        )}
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleAction(m.id, 'update')}
                        >
                          Update
                        </button>
                      </>
                    )}
                    {m.status === 'active' && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleAction(m.id, 'disable')}
                      >
                        Disable
                      </button>
                    )}
                    {m.status === 'inactive' && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleAction(m.id, 'enable')}
                      >
                        Enable
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {releaseNotesFor && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h3 className="card-title">Release notes</h3>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem', margin: 0 }}>
            {modules.find((m) => m.id === releaseNotesFor)?.updateNotes}
          </pre>
        </div>
      )}
    </div>
  )
}
