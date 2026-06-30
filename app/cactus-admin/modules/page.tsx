'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { ModuleStatus } from '@prisma/client'

type GitHubAppStatus = {
  connected: boolean
  hasInstallation: boolean
  hasPat: boolean
}

type DirectoryEntry = {
  repoUrl: string
  repoName: string
  description: string
  installed: boolean
  installedId?: string
  installedVersion?: string
  status?: ModuleStatus
  updateAvailable?: string | null
  updateNotes?: string | null
  lastError?: string | null
  hasTeardown?: boolean
}

type UninstallModal = {
  id: string
  name: string
  hasTeardown: boolean
}

const STATUS_BADGE: Record<ModuleStatus, { label: string; className: string }> = {
  pending_install: { label: 'Pending', className: 'badge-yellow' },
  deploying: { label: 'Deploying', className: 'badge-blue' },
  active: { label: 'Active', className: 'badge-green' },
  inactive: { label: 'Disabled', className: 'badge-gray' },
  failed: { label: 'Failed', className: 'badge-red' },
  update_available: { label: 'Update available', className: 'badge-yellow' },
}

const showVersion = (v?: string | null) => v ? 'v' + v.replace(/^v/i, '') : ''

function formatModuleName(repoName: string): string {
  return repoName
    .replace(/^cactus-module-/, '')
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export default function ModulesPage() {
  const router = useRouter()
  const [entries, setEntries] = useState<DirectoryEntry[]>([])
  const [directoryUnavailable, setDirectoryUnavailable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [ghStatus, setGhStatus] = useState<GitHubAppStatus | null>(null)
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})
  const [releaseNotesFor, setReleaseNotesFor] = useState<string | null>(null)
  const [uninstallModal, setUninstallModal] = useState<UninstallModal | null>(null)
  const [uninstallMode, setUninstallMode] = useState<'code_only' | 'code_and_data'>('code_only')
  const [uninstalling, setUninstalling] = useState(false)

  const loadDirectory = useCallback(async (refresh = false) => {
    try {
      const [dirRes, ghRes] = await Promise.all([
        fetch(`/api/admin/modules/directory${refresh ? '?refresh=true' : ''}`),
        fetch('/api/admin/github-app'),
      ])
      const d = await dirRes.json()
      const modules: DirectoryEntry[] = d.modules ?? []
      setEntries(modules)
      setDirectoryUnavailable(d.directoryUnavailable === true)
      if (ghRes.ok) {
        const gh = await ghRes.json()
        setGhStatus({ connected: gh.connected, hasInstallation: gh.hasInstallation, hasPat: gh.hasPat })
      }
      // Fire update checks for each installed module in parallel; merge results as they arrive
      const installedModules = modules.filter((m) => m.installed && m.installedId)
      if (installedModules.length > 0) {
        Promise.all(
          installedModules.map(async (m) => {
            try {
              const res = await fetch(`/api/admin/modules/${m.installedId}`)
              if (!res.ok) return
              const data = await res.json() as { updateAvailable?: string | null; notes?: string | null }
              if (data.updateAvailable) {
                setEntries((prev) =>
                  prev.map((e) =>
                    e.installedId === m.installedId
                      ? { ...e, updateAvailable: data.updateAvailable, updateNotes: data.notes, status: 'update_available' as const }
                      : e
                  )
                )
              }
            } catch { /* ignore per-module check failures */ }
          })
        )
      }
    } catch {
      setError('Failed to load module directory')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { loadDirectory() }, [loadDirectory])

  async function handleRefresh() {
    setRefreshing(true)
    setError('')
    await loadDirectory(true)
  }

  function setLoaderFor(key: string, val: boolean) {
    setActionLoading((prev) => ({ ...prev, [key]: val }))
  }

  async function handleInstall(repoUrl: string) {
    setError('')
    setLoaderFor(repoUrl, true)
    try {
      const res = await fetch('/api/admin/modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Install failed')
      window.location.href = '/cactus-status/redeploying'
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Install failed')
      setLoaderFor(repoUrl, false)
    }
  }

  async function handleAction(id: string, action: 'update' | 'enable' | 'disable') {
    setError('')
    setLoaderFor(id, true)
    try {
      const res = await fetch(`/api/admin/modules/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Action failed')
      if (action === 'update') {
        window.location.href = '/cactus-status/redeploying'
        return
      }
      await loadDirectory()
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setLoaderFor(id, false)
    }
  }

  function openUninstallModal(entry: DirectoryEntry) {
    if (!entry.installedId) return
    setUninstallModal({ id: entry.installedId, name: formatModuleName(entry.repoName), hasTeardown: entry.hasTeardown ?? false })
    setUninstallMode('code_only')
  }

  async function confirmUninstall() {
    if (!uninstallModal) return
    setUninstalling(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/modules/${uninstallModal.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: uninstallMode }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Uninstall failed')
      setUninstallModal(null)
      window.location.href = '/cactus-status/redeploying'
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Uninstall failed')
      setUninstalling(false)
    }
  }

  const installed = entries.filter((e) => e.installed)
  const available = entries.filter((e) => !e.installed)

  if (loading) return <p>Loading&hellip;</p>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Modules</h1>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {ghStatus && !ghStatus.hasPat && !ghStatus.connected && (
        <div className="alert alert-warning">
          GitHub is not configured. Module install requires a GitHub connection.{' '}
          <a href="../config?tab=integrations">Go to Settings &rarr; Integrations</a> to connect a GitHub App or add a personal access token.
        </div>
      )}

      {ghStatus && !ghStatus.hasPat && ghStatus.connected && !ghStatus.hasInstallation && (
        <div className="alert alert-warning">
          GitHub App is connected but not yet installed on a repository. Module install will fail until you complete the setup.{' '}
          <a href="../config?tab=integrations">Go to Settings &rarr; Integrations</a> and click &ldquo;Install app on repository&rdquo;.
        </div>
      )}

      {/* Installed modules */}
      <section style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: '1rem' }}>Installed</h2>

        {installed.length === 0 ? (
          <div className="alert alert-info">No modules installed yet.</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Version</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {installed.map((m) => (
                  <tr key={m.installedId}>
                    <td>
                      <strong>{formatModuleName(m.repoName)}</strong>
                      {m.description && (
                        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{m.description}</div>
                      )}
                      {m.lastError && (
                        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-destructive)' }}>{m.lastError}</div>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {m.installedVersion && <span className="badge badge-gray">{showVersion(m.installedVersion)}</span>}
                      {m.updateAvailable && (
                        <span className="badge badge-yellow" style={{ marginLeft: '0.5rem' }}>{showVersion(m.updateAvailable)} available</span>
                      )}
                    </td>
                    <td>
                      {m.status && (
                        <span className={`badge ${STATUS_BADGE[m.status]?.className ?? 'badge-gray'}`}>
                          {STATUS_BADGE[m.status]?.label ?? m.status}
                        </span>
                      )}
                    </td>
                    <td style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {m.status === 'update_available' && (
                        <>
                          {m.installedId && (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => setReleaseNotesFor(releaseNotesFor === m.installedId ? null : (m.installedId ?? null))}
                            >
                              Release notes
                            </button>
                          )}
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={actionLoading[m.installedId ?? '']}
                            onClick={() => m.installedId && handleAction(m.installedId, 'update')}
                          >
                            {actionLoading[m.installedId ?? ''] ? 'Updating…' : 'Update'}
                          </button>
                        </>
                      )}
                      {m.status === 'active' && (
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={actionLoading[m.installedId ?? '']}
                          onClick={() => m.installedId && handleAction(m.installedId, 'disable')}
                        >
                          {actionLoading[m.installedId ?? ''] ? 'Disabling…' : 'Disable'}
                        </button>
                      )}
                      {m.status === 'inactive' && (
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={actionLoading[m.installedId ?? '']}
                          onClick={() => m.installedId && handleAction(m.installedId, 'enable')}
                        >
                          {actionLoading[m.installedId ?? ''] ? 'Enabling…' : 'Enable'}
                        </button>
                      )}
                      <button
                        className="btn btn-destructive btn-sm"
                        onClick={() => openUninstallModal(m)}
                      >
                        Uninstall
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {releaseNotesFor && (() => {
          const m = installed.find((e) => e.installedId === releaseNotesFor)
          if (!m) return null
          // Release notes are stored on the module - re-fetch from the [id] endpoint isn't needed here
          // The directory API doesn't carry updateNotes; toggling note from the installed list is cosmetic
          return (
            <div className="card" style={{ marginTop: '1rem' }}>
              <h3 className="card-title">Release notes - {showVersion(m.updateAvailable)}</h3>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', whiteSpace: 'pre-wrap' }}>
                {m.updateNotes || 'No release notes available.'}
              </p>
            </div>
          )
        })()}
      </section>

      {/* Available modules */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 0 }}>Available</h2>
          <button
            className="btn btn-secondary btn-sm"
            disabled={refreshing}
            onClick={handleRefresh}
          >
            {refreshing ? 'Refreshing…' : 'Refresh directory'}
          </button>
        </div>

        {directoryUnavailable ? (
          <div className="alert alert-warning">Module directory is currently unavailable.</div>
        ) : available.length === 0 ? (
          <div className="alert alert-info">All available modules are already installed.</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {available.map((m) => (
                  <tr key={m.repoUrl}>
                    <td><strong>{formatModuleName(m.repoName)}</strong></td>
                    <td style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>{m.description}</td>
                    <td>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={actionLoading[m.repoUrl]}
                        onClick={() => handleInstall(m.repoUrl)}
                      >
                        {actionLoading[m.repoUrl] ? 'Installing…' : 'Install'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Uninstall modal */}
      {uninstallModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setUninstallModal(null) }}
        >
          <div className="card" style={{ maxWidth: '480px', width: '100%', margin: '1rem' }}>
            <h2 className="card-title">Uninstall {uninstallModal.name}</h2>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
              Choose how to remove this module. This cannot be undone.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <label style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="uninstall-mode"
                  value="code_only"
                  checked={uninstallMode === 'code_only'}
                  onChange={() => setUninstallMode('code_only')}
                  style={{ marginTop: '0.2rem' }}
                />
                <span>
                  <strong>Remove code only</strong> (recommended)
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                    Removes the module submodule and its record. Database tables are left intact.
                  </div>
                </span>
              </label>

              <label
                style={{
                  display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
                  cursor: uninstallModal.hasTeardown ? 'pointer' : 'not-allowed',
                  opacity: uninstallModal.hasTeardown ? 1 : 0.5,
                }}
              >
                <input
                  type="radio"
                  name="uninstall-mode"
                  value="code_and_data"
                  checked={uninstallMode === 'code_and_data'}
                  onChange={() => setUninstallMode('code_and_data')}
                  disabled={!uninstallModal.hasTeardown}
                  style={{ marginTop: '0.2rem' }}
                />
                <span>
                  <strong>Remove code and data</strong>{' '}
                  <span style={{ color: 'var(--color-destructive)', fontSize: 'var(--text-sm)' }}>(irreversible)</span>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                    {uninstallModal.hasTeardown
                      ? 'Drops all database tables owned by this module. All data will be permanently deleted.'
                      : 'This module has not declared its teardown tables.'}
                  </div>
                </span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setUninstallModal(null)}
                disabled={uninstalling}
              >
                Cancel
              </button>
              <button
                className="btn btn-destructive"
                onClick={confirmUninstall}
                disabled={uninstalling}
              >
                {uninstalling ? 'Removing…' : 'Confirm uninstall'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
