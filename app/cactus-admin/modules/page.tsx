'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { ModuleStatus } from '@prisma/client'
import { markdownToHtml } from '@/lib/markdown-client'
import { announceRedeployStarted } from '@/lib/deploy-status-client'

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
  updateChannel?: 'public' | 'beta'
  hasPublicRelease?: boolean
}

const MODULE_UPDATE_CHECK_THROTTLE_MS = 10 * 60 * 1000

type UninstallModal = {
  id: string
  name: string
  hasTeardown: boolean
}

type CoreVersionModal = {
  moduleName: string
  requiredVersion: string
  currentVersion: string
}

const STATUS_BADGE: Record<ModuleStatus, { label: string; className: string }> = {
  pending_install: { label: 'Pending', className: 'badge-yellow' },
  deploying: { label: 'Deploying', className: 'badge-blue' },
  pending_deploy: { label: 'Awaiting deployment', className: 'badge-yellow' },
  active: { label: 'Active', className: 'badge-green' },
  inactive: { label: 'Disabled', className: 'badge-gray' },
  failed: { label: 'Failed', className: 'badge-red' },
  update_available: { label: 'Update available', className: 'badge-yellow' },
}

const showVersion = (v?: string | null) => v ? 'v' + v.replace(/^v/i, '') : ''

function moduleInitial(repoName: string): string {
  return formatModuleName(repoName).charAt(0).toUpperCase()
}

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
  const [notice, setNotice] = useState('')
  const [ghStatus, setGhStatus] = useState<GitHubAppStatus | null>(null)
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})
  const [releaseNotesFor, setReleaseNotesFor] = useState<string | null>(null)
  const [uninstallModal, setUninstallModal] = useState<UninstallModal | null>(null)
  const [coreVersionModal, setCoreVersionModal] = useState<CoreVersionModal | null>(null)
  const [uninstallMode, setUninstallMode] = useState<'code_only' | 'code_and_data'>('code_only')
  const [uninstalling, setUninstalling] = useState(false)
  const [checkingModules, setCheckingModules] = useState<Record<string, boolean>>({})
  const [updatingAll, setUpdatingAll] = useState(false)
  const [channelSaving, setChannelSaving] = useState<Record<string, boolean>>({})
  const [installChannel, setInstallChannel] = useState<Record<string, 'public' | 'beta'>>({})

  const checkModuleUpdate = useCallback(async (installedId: string, force = false) => {
    const sessionKey = `cactus-module-update-check-${installedId}`
    if (!force) {
      const lastChecked = Number(sessionStorage.getItem(sessionKey))
      if (!Number.isNaN(lastChecked) && Date.now() - lastChecked < MODULE_UPDATE_CHECK_THROTTLE_MS) return
    }
    setCheckingModules((prev) => ({ ...prev, [installedId]: true }))
    try {
      const res = await fetch(`/api/admin/modules/${installedId}`)
      if (!res.ok) return
      const data = await res.json() as { updateAvailable?: string | null; notes?: string | null }
      if (data.updateAvailable) {
        setEntries((prev) =>
          prev.map((e) =>
            e.installedId === installedId
              ? { ...e, updateAvailable: data.updateAvailable, updateNotes: data.notes, status: 'update_available' as const }
              : e
          )
        )
      }
      sessionStorage.setItem(sessionKey, String(Date.now()))
    } catch {
      // ignore per-module check failures
    } finally {
      setCheckingModules((prev) => ({ ...prev, [installedId]: false }))
    }
  }, [])

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
      // For each installed module: reconcile stale 'deploying' status (Hobby-plan fallback
      // for when the deploy status was dismissed mid-build), otherwise check for updates
      // (respecting the per-module throttle unless this was a deliberate refresh).
      const installedModules = modules.filter((m) => m.installed && m.installedId)
      if (installedModules.length > 0) {
        Promise.all(
          installedModules.map(async (m) => {
            if (m.status === 'deploying') {
              try {
                const res = await fetch(`/api/admin/modules/${m.installedId}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'check-status' }),
                })
                if (!res.ok) return
                const data = await res.json() as { status?: ModuleStatus }
                if (data.status && data.status !== 'deploying') {
                  // check-status just promoted version/updateAvailable server-side too -
                  // pull the fresh row rather than patching only `status`, or the "update
                  // available" badge lingers stale until a full page reload.
                  const dirRes = await fetch('/api/admin/modules/directory')
                  if (dirRes.ok) {
                    const dir = await dirRes.json() as { modules?: DirectoryEntry[] }
                    const fresh = dir.modules?.find((e) => e.installedId === m.installedId)
                    if (fresh) {
                      setEntries((prev) =>
                        prev.map((e) => (e.installedId === m.installedId ? fresh : e))
                      )
                      return
                    }
                  }
                  setEntries((prev) =>
                    prev.map((e) =>
                      e.installedId === m.installedId ? { ...e, status: data.status } : e
                    )
                  )
                }
              } catch { /* ignore per-module check failures */ }
              return
            }
            await checkModuleUpdate(m.installedId as string, refresh)
          })
        )
      }
    } catch {
      setError('Failed to load module directory')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [checkModuleUpdate])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- async directory load on mount; all state updates are after awaits
  useEffect(() => { loadDirectory() }, [loadDirectory])

  async function handleRefresh() {
    setRefreshing(true)
    setError('')
    await loadDirectory(true)
  }

  async function handleModuleChannelChange(installedId: string, newChannel: 'public' | 'beta') {
    const current = entries.find((e) => e.installedId === installedId)
    if (!current || current.updateChannel === newChannel || channelSaving[installedId]) return
    setChannelSaving((prev) => ({ ...prev, [installedId]: true }))
    setEntries((prev) => prev.map((e) => (e.installedId === installedId ? { ...e, updateChannel: newChannel } : e)))
    try {
      const res = await fetch(`/api/admin/modules/${installedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updateChannel: newChannel }),
      })
      if (!res.ok) {
        setEntries((prev) => prev.map((e) => (e.installedId === installedId ? { ...e, updateChannel: current.updateChannel } : e)))
        return
      }
      await checkModuleUpdate(installedId, true)
    } catch {
      setEntries((prev) => prev.map((e) => (e.installedId === installedId ? { ...e, updateChannel: current.updateChannel } : e)))
    } finally {
      setChannelSaving((prev) => ({ ...prev, [installedId]: false }))
    }
  }

  function setLoaderFor(key: string, val: boolean) {
    setActionLoading((prev) => ({ ...prev, [key]: val }))
  }

  async function handleInstall(repoUrl: string) {
    setError('')
    setNotice('')
    setLoaderFor(repoUrl, true)
    const entry = entries.find((e) => e.repoUrl === repoUrl)
    const channel = entry?.hasPublicRelease === false ? 'beta' : (installChannel[repoUrl] ?? 'public')
    try {
      const res = await fetch('/api/admin/modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl, channel }),
      })
      const d = await res.json()
      if (!res.ok) {
        if (d.code === 'core_version_required') {
          setCoreVersionModal({ moduleName: d.moduleName, requiredVersion: d.requiredVersion, currentVersion: d.currentVersion })
          return
        }
        throw new Error(d.error ?? 'Install failed')
      }
      if (d.redeployTriggered) {
        // Opens the notification bell with live deploy status
        announceRedeployStarted()
      } else {
        setNotice(
          channel === 'beta'
            ? 'Beta module installed. Your changes are waiting to go live - review and redeploy from Notifications.'
            : 'Module installed. Your changes are waiting to go live - review and redeploy from Notifications.'
        )
      }
      await loadDirectory()
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Install failed')
    } finally {
      setLoaderFor(repoUrl, false)
    }
  }

  async function handleAction(id: string, action: 'update' | 'enable' | 'disable') {
    setError('')
    setNotice('')
    setLoaderFor(id, true)
    try {
      const res = await fetch(`/api/admin/modules/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const d = await res.json()
      if (!res.ok) {
        if (d.code === 'core_version_required') {
          setCoreVersionModal({ moduleName: d.moduleName, requiredVersion: d.requiredVersion, currentVersion: d.currentVersion })
          return
        }
        throw new Error(d.error ?? 'Action failed')
      }
      if (d.redeployTriggered) {
        announceRedeployStarted()
      } else if (action === 'update') {
        setNotice('Module updated. Your changes are waiting to go live - review and redeploy from Notifications.')
      }
      await loadDirectory()
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setLoaderFor(id, false)
    }
  }

  async function handleUpdateAll() {
    setError('')
    setNotice('')
    setUpdatingAll(true)
    try {
      const res = await fetch('/api/admin/modules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-all' }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Update failed')
      if (d.redeployTriggered) {
        announceRedeployStarted()
      } else {
        const failed: string[] = d.failed ?? []
        if (d.updated > 0) {
          setNotice(
            `${d.updated} module${d.updated === 1 ? '' : 's'} updated${failed.length ? `, ${failed.length} failed` : ''}. Your changes are waiting to go live - review and redeploy from Notifications.`
          )
        } else if (failed.length > 0) {
          setError(`Failed to update: ${failed.join(', ')}`)
        } else {
          setNotice('No updates available.')
        }
      }
      await loadDirectory()
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setUpdatingAll(false)
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
    setNotice('')
    try {
      const res = await fetch(`/api/admin/modules/${uninstallModal.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: uninstallMode }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Uninstall failed')
      setUninstallModal(null)
      if (d.redeployTriggered) {
        announceRedeployStarted()
      } else {
        setNotice('Module uninstalled. Your changes are waiting to go live - review and redeploy from Notifications.')
      }
      await loadDirectory()
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Uninstall failed')
    } finally {
      setUninstalling(false)
    }
  }

  const installed = entries.filter((e) => e.installed)
  const available = entries.filter((e) => !e.installed)
  const updatableCount = installed.filter((m) => m.status === 'update_available').length

  if (loading) return <p>Loading&hellip;</p>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Modules</h1>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {notice && <div className="alert alert-info">{notice}</div>}

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 0 }}>Installed</h2>
          {updatableCount > 1 && (
            <button
              className="btn btn-primary btn-sm"
              disabled={updatingAll}
              onClick={handleUpdateAll}
            >
              {updatingAll ? 'Updating all…' : `Update all (${updatableCount})`}
            </button>
          )}
        </div>

        {installed.length === 0 ? (
          <div className="alert alert-info">No modules installed yet.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 380px))', gap: '1.25rem' }}>
            {installed.map((m) => (
              <div key={m.installedId} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', marginBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 'var(--radius-md)', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--color-primary-subtle)', color: 'var(--color-primary-dark)',
                    fontSize: 'var(--text-base)', fontWeight: 700,
                  }}>
                    {moduleInitial(m.repoName)}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 'var(--text-base)', flex: 1, minWidth: 0 }}>{formatModuleName(m.repoName)}</div>
                  {m.status && (
                    <span className={`badge ${STATUS_BADGE[m.status]?.className ?? 'badge-gray'}`} style={{ flexShrink: 0 }}>
                      {STATUS_BADGE[m.status]?.label ?? m.status}
                    </span>
                  )}
                </div>

                {m.description && (
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>{m.description}</div>
                )}

                {m.lastError && (
                  <div className="alert alert-danger" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>{m.lastError}</div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {m.installedVersion && <span className="badge badge-gray">{showVersion(m.installedVersion)}</span>}
                  {m.updateChannel === 'beta' && <span className="badge badge-primary">Beta</span>}
                  {m.updateAvailable && (
                    <span className="badge badge-yellow">{showVersion(m.updateAvailable)} available</span>
                  )}
                  <button
                    type="button"
                    title="Check for updates"
                    aria-label="Check for updates"
                    disabled={checkingModules[m.installedId ?? '']}
                    onClick={() => m.installedId && checkModuleUpdate(m.installedId, true)}
                    style={{
                      background: 'none', border: 'none', padding: 0,
                      display: 'inline-flex', alignItems: 'center',
                      cursor: checkingModules[m.installedId ?? ''] ? 'default' : 'pointer',
                      fontSize: '0.9rem', color: 'var(--color-text-muted)',
                      animation: checkingModules[m.installedId ?? ''] ? 'cactus-spin 0.7s linear infinite' : 'none',
                    }}
                  >
                    &#8635;
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Update channel</span>
                  <div style={{
                    display: 'inline-flex', padding: 2, gap: 2,
                    background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)',
                    opacity: channelSaving[m.installedId ?? ''] ? 0.6 : 1,
                  }}>
                    {(['public', 'beta'] as const).map((channel) => (
                      <button
                        key={channel}
                        type="button"
                        disabled={!m.installedId || channelSaving[m.installedId]}
                        onClick={() => m.installedId && handleModuleChannelChange(m.installedId, channel)}
                        style={{
                          border: 'none', borderRadius: 'var(--radius-full)', padding: '0.25rem 0.75rem',
                          fontSize: 'var(--text-sm)', fontWeight: 500, cursor: 'pointer',
                          background: (m.updateChannel ?? 'public') === channel ? 'var(--color-primary)' : 'transparent',
                          color: (m.updateChannel ?? 'public') === channel ? 'var(--color-on-primary)' : 'var(--color-text-muted)',
                        }}
                      >
                        {channel === 'public' ? 'Public' : 'Beta'}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{
                  display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center',
                  marginTop: 'auto', paddingTop: '0.875rem', borderTop: '1px solid var(--color-border)',
                }}>
                  {m.status === 'update_available' && (
                    <>
                      {m.installedId && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setReleaseNotesFor(m.installedId ?? null)}
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
                </div>

              </div>
            ))}
          </div>
        )}
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 380px))', gap: '1.25rem' }}>
            {available.map((m) => (
              <div key={m.repoUrl} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: 0 }}>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 'var(--radius-md)', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--color-bg-subtle)', color: 'var(--color-text-muted)',
                    fontSize: 'var(--text-base)', fontWeight: 700,
                  }}>
                    {moduleInitial(m.repoName)}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 'var(--text-base)', marginTop: 6 }}>{formatModuleName(m.repoName)}</div>
                </div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', flex: 1, lineHeight: 1.4 }}>{m.description}</div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Channel</span>
                  {m.hasPublicRelease === false ? (
                    <span className="badge badge-primary">Beta only</span>
                  ) : (
                    <div style={{
                      display: 'inline-flex', padding: 2, gap: 2,
                      background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)',
                    }}>
                      {(['public', 'beta'] as const).map((channel) => (
                        <button
                          key={channel}
                          type="button"
                          disabled={actionLoading[m.repoUrl]}
                          onClick={() => setInstallChannel((prev) => ({ ...prev, [m.repoUrl]: channel }))}
                          style={{
                            border: 'none', borderRadius: 'var(--radius-full)', padding: '0.25rem 0.75rem',
                            fontSize: 'var(--text-sm)', fontWeight: 500, cursor: 'pointer',
                            background: (installChannel[m.repoUrl] ?? 'public') === channel ? 'var(--color-primary)' : 'transparent',
                            color: (installChannel[m.repoUrl] ?? 'public') === channel ? 'var(--color-on-primary)' : 'var(--color-text-muted)',
                          }}
                        >
                          {channel === 'public' ? 'Public' : 'Beta'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  className="btn btn-primary btn-sm"
                  style={{ alignSelf: 'flex-start' }}
                  disabled={actionLoading[m.repoUrl]}
                  onClick={() => handleInstall(m.repoUrl)}
                >
                  {actionLoading[m.repoUrl]
                    ? 'Installing…'
                    : m.hasPublicRelease === false || (installChannel[m.repoUrl] ?? 'public') === 'beta' ? 'Install beta' : 'Install'}
                </button>
              </div>
            ))}
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

      {/* Release notes modal */}
      {releaseNotesFor && (() => {
        const m = installed.find((e) => e.installedId === releaseNotesFor)
        if (!m) return null
        return (
          <div
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onClick={(e) => { if (e.target === e.currentTarget) setReleaseNotesFor(null) }}
          >
            <div className="card" style={{ maxWidth: '560px', width: '100%', margin: '1rem', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1rem' }}>
                <h2 className="card-title" style={{ margin: 0 }}>
                  {formatModuleName(m.repoName)} &ndash; {showVersion(m.updateAvailable)}
                </h2>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setReleaseNotesFor(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', lineHeight: 1, color: 'var(--color-text-muted)' }}
                >
                  &times;
                </button>
              </div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', lineHeight: 1.6, overflowY: 'auto' }}>
                {m.updateNotes ? (
                  <div dangerouslySetInnerHTML={{ __html: markdownToHtml(m.updateNotes) }} />
                ) : (
                  <p style={{ margin: 0 }}>No release notes available.</p>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Core version required modal */}
      {coreVersionModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setCoreVersionModal(null) }}
        >
          <div className="card" style={{ maxWidth: '480px', width: '100%', margin: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1rem' }}>
              <h2 className="card-title" style={{ margin: 0 }}>Cactus needs updating first</h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setCoreVersionModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', lineHeight: 1, color: 'var(--color-text-muted)' }}
              >
                &times;
              </button>
            </div>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
              &ldquo;{coreVersionModal.moduleName}&rdquo; needs Cactus v{coreVersionModal.requiredVersion} or newer -
              this site is on v{coreVersionModal.currentVersion}. Update Cactus first from the update panel, then
              install the module.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setCoreVersionModal(null)}>
                Cancel
              </button>
              <a className="btn btn-primary" href="../config?tab=general">
                Go to update panel
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
