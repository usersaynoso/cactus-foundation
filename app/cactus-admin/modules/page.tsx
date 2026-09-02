'use client'

import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { ModuleStatus } from '@prisma/client'
import { markdownToHtml } from '@/lib/markdown-client'
import { announceRedeployStarted, useDeployInFlight } from '@/lib/deploy-status-client'
import { looksLikeGitHubProblem, GITHUB_OUTAGE_HINT, GITHUB_STATUS_URL } from '@/lib/updates/github-outage'
import { readJsonResponse } from '@/lib/updates/read-json-response'
import { compareVersions } from '@/lib/updates/version'
import { TabStrip } from '@/components/admin/TabStrip'
import { setUrlParams } from '@/lib/admin/tab-url'
import { ModuleArt } from './ModuleArt'
import { CardMenu } from './CardMenu'

// The shape the module install/update/uninstall handlers answer with. Only the fields
// the UI branches on - a killed function answers with none of them.
type ModuleActionResponse = {
  ok?: boolean
  error?: string
  code?: string
  moduleName?: string
  requiredVersion?: string
  currentVersion?: string
  redeployTriggered?: boolean
  status?: ModuleStatus
  failed?: string[]
  updated?: number
  /** Set when an install carried the pending Cactus update out with it. */
  coreUpdatedTo?: string | null
  moduleUpdatesQueued?: number
  moduleUpdatesSkipped?: string[]
}

// Just enough of GET /api/admin/updates for the install dialog: whether a Cactus
// update is sitting there, and which version it is. Shares the settings panel's
// sessionStorage cache, so opening the store straight after Settings costs nothing.
type CoreUpdateInfo = { currentVersion: string; latestVersion: string }

type UpdatesApiResponse = {
  status?: {
    localMode?: true
    configured?: boolean
    updateAvailable?: boolean
    currentVersion?: string
    latestVersion?: string
  }
}

const CORE_UPDATE_CACHE_KEY = 'cactus-core-update-check'
const CORE_UPDATE_THROTTLE_MS = 10 * 60 * 1000

function coreUpdateFrom(d: UpdatesApiResponse): CoreUpdateInfo | null {
  const s = d.status
  if (!s || s.localMode || !s.configured || !s.updateAvailable) return null
  if (!s.currentVersion || !s.latestVersion) return null
  return { currentVersion: s.currentVersion, latestVersion: s.latestVersion }
}

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
  /** Retired upstream. Never offered for install; flagged on the card if it is
   *  already installed, so the owner knows to remove it in their own time. */
  deprecated?: boolean
}

const MODULE_UPDATE_CHECK_THROTTLE_MS = 10 * 60 * 1000

type UninstallModal = {
  id: string
  name: string
  hasTeardown: boolean
}

// A blocker the owner has to clear before the thing they clicked can work -
// Cactus is too old, a sibling module is too old, and whatever else the API
// grows next. These never belong in the red strip at the top of the page: it
// scrolls away, it reads like a failure rather than an instruction, and the
// instruction is the entire point. Anything the API refuses with a code ending
// `_required` lands here instead, so a new prerequisite needs no UI change.
type PrerequisiteModal = {
  title: string
  message: string
  /** Only Cactus itself has somewhere else to send them. */
  updatePanel: boolean
  /**
   * The install that hit the blocker, so "Cactus is too old" can be answered on the
   * spot - the pending core update rides out in the install's own deployment - rather
   * than by sending them to another page to wait through a build first.
   */
  retry?: { repoUrl: string; channel: 'public' | 'beta'; requiredVersion: string }
}

const PREREQUISITE_TITLES: Record<string, string> = {
  core_version_required: 'Cactus needs updating first',
  module_version_required: 'Another module needs sorting first',
}

function prerequisiteFrom(
  d: ModuleActionResponse,
  fallback: string,
  install?: { repoUrl: string; channel: 'public' | 'beta' }
): PrerequisiteModal | null {
  if (typeof d.code !== 'string' || !d.code.endsWith('_required')) return null
  return {
    title: PREREQUISITE_TITLES[d.code] ?? 'Something needs doing first',
    // Verbatim from the server, which is where the whole diagnostic lives and
    // is already written for a site owner rather than a developer.
    message: d.error ?? fallback,
    updatePanel: d.code === 'core_version_required',
    retry: d.code === 'core_version_required' && install && d.requiredVersion
      ? { ...install, requiredVersion: d.requiredVersion }
      : undefined,
  }
}

// "Cactus v0.5.2 and 2 module updates" - what else rode out in the deployment the
// action just started. Install and uninstall both offer the same tick boxes, so they
// report the outcome the same way.
function alsoWentOut(d: ModuleActionResponse): string {
  const queued = d.moduleUpdatesQueued ?? 0
  return [
    d.coreUpdatedTo ? `Cactus v${d.coreUpdatedTo.replace(/^v/i, '')}` : null,
    queued > 0 ? `${queued} module update${queued === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(' and ')
}

// Anything the compatibility check held back, said plainly - otherwise it just sits on
// the Updates tab afterwards looking like the tick box missed it.
function heldBackNote(skipped: string[]): string {
  return `Not included in this deployment: ${skipped.join(', ')}. ${skipped.length === 1 ? 'It stays' : 'They stay'} on the Updates tab - try again once this deployment is live.`
}

/** Which shelf of the store is on screen. */
const STORE_TABS = ['installed', 'updates', 'browse', 'custom'] as const
type StoreTab = (typeof STORE_TABS)[number]

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

/** A count pill next to a tab label. Omitted at zero - an empty shelf says so itself. */
function tabLabel(text: string, count: number, tone = 'badge-gray'): ReactNode {
  if (count <= 0) return text
  return (
    <>
      {text}
      <span className={`badge ${tone}`} style={{ marginLeft: '0.375rem' }}>{count}</span>
    </>
  )
}

function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="module-empty">
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  )
}

function LoadingGrid() {
  return (
    <div className="module-grid">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="card module-card">
          <div className="module-card__art">
            <span className="skeleton" style={{ position: 'absolute', inset: 0, borderRadius: 0 }} />
          </div>
          <div className="module-card__body">
            <span className="skeleton" style={{ height: 15, width: '55%', borderRadius: 'var(--radius-sm)' }} />
            <span className="skeleton" style={{ height: 11, width: '100%', borderRadius: 'var(--radius-sm)' }} />
            <span className="skeleton" style={{ height: 11, width: '80%', borderRadius: 'var(--radius-sm)' }} />
          </div>
        </div>
      ))}
    </div>
  )
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
  const [prerequisiteModal, setPrerequisiteModal] = useState<PrerequisiteModal | null>(null)
  const [uninstallMode, setUninstallMode] = useState<'code_only' | 'code_and_data'>('code_only')
  const [uninstalling, setUninstalling] = useState(false)
  // True while the uninstall dialog is still finding out what else is waiting.
  const [uninstallChecking, setUninstallChecking] = useState(false)
  const [checkingModules, setCheckingModules] = useState<Record<string, boolean>>({})
  const [updatingAll, setUpdatingAll] = useState(false)
  const deployInFlight = useDeployInFlight()
  const [channelSaving, setChannelSaving] = useState<Record<string, boolean>>({})
  const [installChannel, setInstallChannel] = useState<Record<string, 'public' | 'beta'>>({})
  const [customUrl, setCustomUrl] = useState('')
  const [customChannel, setCustomChannel] = useState<'public' | 'beta'>('public')
  const [coreUpdate, setCoreUpdate] = useState<CoreUpdateInfo | null>(null)
  const [installModal, setInstallModal] = useState<{ repoUrl: string; name: string; channel: 'public' | 'beta' } | null>(null)
  const [bundleCore, setBundleCore] = useState(true)
  const [bundleModules, setBundleModules] = useState(true)
  // repoUrl of the install whose "is anything else waiting?" check is in flight.
  const [installChecking, setInstallChecking] = useState<string | null>(null)
  // null until the owner picks a tab, so the landing shelf can follow the data
  // (their own modules if they have any, the store if they haven't) without an effect.
  const [tab, setTab] = useState<StoreTab | null>(null)
  const [query, setQuery] = useState('')

  // Pick the shelf out of the URL, so a refresh stays on it. After mount rather
  // than during render: the fallback depends on what the modules fetch turns up,
  // which the first render doesn't know either.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot read of the URL's tab on mount
    if (t && (STORE_TABS as readonly string[]).includes(t)) setTab(t as StoreTab)
  }, [])

  // Clicking a shelf writes it back, so the refresh above has something to find.
  const selectTab = useCallback((next: StoreTab) => {
    setTab(next)
    setUrlParams({ tab: next })
  }, [])

  // Returns whether this module has an update waiting, so a caller that needs an
  // answer now (the install dialog) can decide on the fresh result rather than on
  // whatever `entries` happened to be holding.
  const checkModuleUpdate = useCallback(async (installedId: string, force = false): Promise<boolean> => {
    const sessionKey = `cactus-module-update-check-${installedId}`
    if (!force) {
      const lastChecked = Number(sessionStorage.getItem(sessionKey))
      if (!Number.isNaN(lastChecked) && Date.now() - lastChecked < MODULE_UPDATE_CHECK_THROTTLE_MS) return false
    }
    setCheckingModules((prev) => ({ ...prev, [installedId]: true }))
    try {
      const res = await fetch(`/api/admin/modules/${installedId}`)
      if (!res.ok) return false
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
      return Boolean(data.updateAvailable)
    } catch {
      // ignore per-module check failures
      return false
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

  // Is there a Cactus update waiting? Only used to decide whether the install dialog
  // offers to bring it along. A 403 here is a perfectly normal answer - someone who
  // may install modules but not change settings simply isn't offered the core box.
  const loadCoreUpdate = useCallback(async (force = false): Promise<CoreUpdateInfo | null> => {
    const cached = force ? null : sessionStorage.getItem(CORE_UPDATE_CACHE_KEY)
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { at: number; data: UpdatesApiResponse }
        if (Date.now() - parsed.at < CORE_UPDATE_THROTTLE_MS) {
          const info = coreUpdateFrom(parsed.data)
          setCoreUpdate(info)
          return info
        }
      } catch { /* malformed cache: fall through to a fresh check */ }
    }
    try {
      const res = await fetch('/api/admin/updates')
      if (!res.ok) return null
      const d = (await res.json()) as UpdatesApiResponse
      sessionStorage.setItem(CORE_UPDATE_CACHE_KEY, JSON.stringify({ at: Date.now(), data: d }))
      const info = coreUpdateFrom(d)
      setCoreUpdate(info)
      return info
    } catch { /* the dialog just doesn't offer the core box */ }
    return null
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- async directory load on mount; all state updates are after awaits
  useEffect(() => { loadDirectory() }, [loadDirectory])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- async update check on mount; all state updates are after awaits
  useEffect(() => { loadCoreUpdate() }, [loadCoreUpdate])

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

  // Clicking Install asks first, but only when there is something worth asking about:
  // a Cactus update or other modules' updates can ride out in the very deployment this
  // install triggers, which saves the owner sitting through two more builds. Nothing
  // waiting, nothing to tick - go straight in, as it always did.
  //
  // Both answers are checked FRESH here rather than read off the state the page loaded
  // with. That state is throttled for ten minutes and fetched fire-and-forget on mount,
  // so a page opened just before a release went out - or clicked before its own checks
  // landed - would decide there was nothing to offer and install silently. One round
  // trip per Install click is nothing beside the build it starts.
  async function requestInstall(repoUrl: string, channelOverride?: 'public' | 'beta') {
    const entry = entries.find((e) => e.repoUrl === repoUrl)
    const channel = channelOverride ?? (entry?.hasPublicRelease === false ? 'beta' : (installChannel[repoUrl] ?? 'public'))

    const installedModules = entries.filter((e) => e.installed && e.installedId)
    setInstallChecking(repoUrl)
    let core: CoreUpdateInfo | null = null
    let waiting = 0
    try {
      const [freshCore, results] = await Promise.all([
        loadCoreUpdate(true),
        Promise.all(installedModules.map((m) => checkModuleUpdate(m.installedId as string, true))),
      ])
      core = freshCore
      // A module the fresh check says nothing about but whose row already reads
      // "update available" still counts: the check only ever promotes a status, it
      // never clears one, and the server's own batch gate drops any no-ops anyway.
      waiting = installedModules.filter((m, i) => results[i] || m.status === 'update_available').length
    } finally {
      setInstallChecking(null)
    }

    if (!core && waiting === 0) {
      void performInstall(repoUrl, channel)
      return
    }
    setBundleCore(core !== null)
    setBundleModules(waiting > 0)
    setInstallModal({
      repoUrl,
      channel,
      name: entry ? formatModuleName(entry.repoName) : formatModuleName(repoUrl.split('/').pop() ?? 'module'),
    })
  }

  async function performInstall(
    repoUrl: string,
    channel: 'public' | 'beta',
    bundle: { updateCore?: boolean; updateModules?: boolean } = {}
  ): Promise<boolean> {
    setError('')
    setNotice('')
    setLoaderFor(repoUrl, true)
    try {
      const res = await fetch('/api/admin/modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl, channel, ...bundle }),
      })
      // Not res.json(): a run killed at the platform's time limit answers with HTML, and
      // parsing that throws a browser message no site owner can act on.
      const parsed = await readJsonResponse<ModuleActionResponse>(res, 'Install failed')
      const d = parsed.data ?? {}
      if (!parsed.ok) {
        const blocker = prerequisiteFrom(d, parsed.error ?? 'Install failed', { repoUrl, channel })
        if (blocker) {
          setInstallModal(null)
          setPrerequisiteModal(blocker)
          return false
        }
        throw new Error(parsed.error ?? 'Install failed')
      }
      setInstallModal(null)
      // What else went out in the same deployment, if anything.
      const alsoWent = alsoWentOut(d)

      if (d.redeployTriggered) {
        // Opens the notification bell with live deploy status
        announceRedeployStarted()
        if (alsoWent) setNotice(`${alsoWent} went out in the same deployment.`)
      } else {
        setNotice(
          (channel === 'beta'
            ? 'Beta module installed.'
            : 'Module installed.') +
          (alsoWent ? ` ${alsoWent} came along with it.` : '') +
          ' Your changes are waiting to go live - review and redeploy from Notifications.'
        )
      }
      const skipped = d.moduleUpdatesSkipped ?? []
      if (skipped.length > 0) setError(heldBackNote(skipped))
      if (customUrl.trim() === repoUrl) setCustomUrl('')
      await loadDirectory()
      router.refresh()
      return true
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Install failed')
      return false
    } finally {
      setLoaderFor(repoUrl, false)
    }
  }

  // The custom-URL panel funnels into the same install call the directory
  // cards use - the server-side error messages coming back are the entire
  // diagnostic story, so they are surfaced verbatim via setError above.
  function handleCustomInstall() {
    const url = customUrl.trim()
    if (!url) return
    void requestInstall(url, customChannel)
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
      const parsed = await readJsonResponse<ModuleActionResponse>(res, 'Action failed')
      const d = parsed.data ?? {}
      if (!parsed.ok) {
        const blocker = prerequisiteFrom(d, parsed.error ?? 'Action failed')
        if (blocker) {
          setPrerequisiteModal(blocker)
          return
        }
        throw new Error(parsed.error ?? 'Action failed')
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
      const parsed = await readJsonResponse<ModuleActionResponse>(res, 'Update failed')
      if (!parsed.ok) throw new Error(parsed.error ?? 'Update failed')
      const d = parsed.data ?? {}
      const failed: string[] = d.failed ?? []
      if (d.redeployTriggered) {
        announceRedeployStarted()
      } else {
        const updatedCount = d.updated ?? 0
        if (updatedCount > 0) {
          setNotice(
            `${updatedCount} module${updatedCount === 1 ? '' : 's'} updated${failed.length ? `, ${failed.length} failed` : ''}. Your changes are waiting to go live - review and redeploy from Notifications.`
          )
        } else if (failed.length > 0) {
          setError(`Failed to update: ${failed.join(', ')}`)
        } else {
          setNotice('No updates available.')
        }
      }
      // Say so whichever branch ran. A batch that triggered a redeploy used to
      // announce the deploy and drop this on the floor, so a module skipped for
      // an unmet requirement just sat on the Updates tab afterwards with no
      // explanation, looking for all the world like the button had missed it.
      if (failed.length > 0) {
        setError(
          `Not included in this update: ${failed.join(', ')}. ${failed.length === 1 ? 'It stays' : 'They stay'} on the Updates tab - try again once this deployment is live.`
        )
      }
      await loadDirectory()
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setUpdatingAll(false)
    }
  }

  // Opening the confirm dialog also asks - freshly - whether a Cactus update or other
  // modules' updates are waiting, because removing a module costs a deployment and
  // anything ticked can ride out in that same one. Asked in the background rather than
  // in front of the dialog: this is a destructive confirmation and it should appear the
  // instant it is clicked. Confirming before the answer lands bundles nothing, which is
  // exactly what happened before the boxes existed.
  function openUninstallModal(entry: DirectoryEntry) {
    if (!entry.installedId) return
    const removingId = entry.installedId
    setUninstallModal({ id: removingId, name: formatModuleName(entry.repoName), hasTeardown: entry.hasTeardown ?? false })
    setUninstallMode('code_only')
    setBundleCore(false)
    setBundleModules(false)
    setUninstallChecking(true)
    // The module on its way out is excluded: an update for it is moot, and the server
    // refuses to pin one into the very commit that removes it.
    const others = entries.filter((e) => e.installed && e.installedId && e.installedId !== removingId)
    void (async () => {
      try {
        const [core, results] = await Promise.all([
          loadCoreUpdate(true),
          Promise.all(others.map((m) => checkModuleUpdate(m.installedId as string, true))),
        ])
        // A module the fresh check says nothing about but whose row already reads
        // "update available" still counts: the check only ever promotes a status.
        setBundleCore(core !== null)
        setBundleModules(others.some((m, i) => results[i] || m.status === 'update_available'))
      } finally {
        setUninstallChecking(false)
      }
    })()
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
        body: JSON.stringify({
          mode: uninstallMode,
          updateCore: coreUpdate !== null && bundleCore,
          updateModules: uninstallUpdatable.length > 0 && bundleModules,
        }),
      })
      const parsed = await readJsonResponse<ModuleActionResponse>(res, 'Uninstall failed')
      if (!parsed.ok) throw new Error(parsed.error ?? 'Uninstall failed')
      const d = parsed.data ?? {}
      setUninstallModal(null)
      const alsoWent = alsoWentOut(d)
      if (d.redeployTriggered) {
        announceRedeployStarted()
        if (alsoWent) setNotice(`${alsoWent} went out in the same deployment.`)
      } else {
        setNotice(
          'Module uninstalled.' +
          (alsoWent ? ` ${alsoWent} came along with it.` : '') +
          ' Your changes are waiting to go live - review and redeploy from Notifications.'
        )
      }
      const skipped = d.moduleUpdatesSkipped ?? []
      if (skipped.length > 0) setError(heldBackNote(skipped))
      await loadDirectory()
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Uninstall failed')
    } finally {
      setUninstalling(false)
    }
  }

  const installed = entries.filter((e) => e.installed)
  // A retired module stays visible to the sites that already have it, but it never
  // appears on the browse shelf again - there is nothing to install any more.
  const available = entries.filter((e) => !e.installed && !e.deprecated)
  const updatable = installed.filter((m) => m.status === 'update_available')
  const updatableCount = updatable.length
  // What the uninstall dialog may offer, which is every pending update EXCEPT the one
  // belonging to the module being removed.
  const uninstallUpdatable = uninstallModal
    ? updatable.filter((m) => m.installedId !== uninstallModal.id)
    : []
  const customBusy = Boolean(actionLoading[customUrl.trim()]) || installChecking === customUrl.trim()
  const activeTab: StoreTab = tab ?? (installed.length > 0 ? 'installed' : 'browse')

  const q = query.trim().toLowerCase()
  const matchesQuery = (e: DirectoryEntry) =>
    !q ||
    formatModuleName(e.repoName).toLowerCase().includes(q) ||
    e.repoName.toLowerCase().includes(q) ||
    (e.description ?? '').toLowerCase().includes(q)

  const shownInstalled = installed.filter(matchesQuery)
  const shownUpdatable = updatable.filter(matchesQuery)
  const shownAvailable = available.filter(matchesQuery)

  function installedCard(m: DirectoryEntry) {
    const id = m.installedId ?? ''
    const name = formatModuleName(m.repoName)
    const busy = actionLoading[id]
    const channel = m.updateChannel ?? 'public'

    return (
      <div key={id} className="card module-card">
        <ModuleArt repoUrl={m.repoUrl} repoName={m.repoName} initial={moduleInitial(m.repoName)} />

        <div className="module-card__body">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
            <div className="module-card__name" style={{ flex: 1 }}>{name}</div>
            {m.deprecated
              ? <span className="badge badge-red" style={{ flexShrink: 0 }}>Deprecated</span>
              : m.status && (
                <span className={`badge ${STATUS_BADGE[m.status]?.className ?? 'badge-gray'}`} style={{ flexShrink: 0 }}>
                  {STATUS_BADGE[m.status]?.label ?? m.status}
                </span>
              )}
          </div>

          {m.description && <div className="module-card__desc" title={m.description}>{m.description}</div>}

          {m.deprecated && (
            <div className="alert alert-warning" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
              This one has been retired. It carries on working for now, but there will be no more
              updates or fixes - uninstall it whenever suits you.
            </div>
          )}

          {m.lastError && (
            <div className="alert alert-danger" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>{m.lastError}</div>
          )}

          <div className="module-card__meta">
            {m.installedVersion && <span className="badge badge-gray">{showVersion(m.installedVersion)}</span>}
            {channel === 'beta' && <span className="badge badge-primary">Beta</span>}
            {m.updateAvailable && <span className="badge badge-yellow">{showVersion(m.updateAvailable)} available</span>}
            {checkingModules[id] && (
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Checking&hellip;</span>
            )}
          </div>
        </div>

        <div className="module-card__foot">
          {m.status === 'update_available' ? (
            <>
              <button
                className="btn btn-primary btn-sm"
                disabled={busy || deployInFlight}
                title={deployInFlight ? 'A deployment is running - updates resume once it is live' : undefined}
                onClick={() => id && handleAction(id, 'update')}
              >
                {busy ? 'Updating…' : deployInFlight ? 'Deploying…' : `Update to ${showVersion(m.updateAvailable)}`}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setReleaseNotesFor(id)}>
                What&rsquo;s new
              </button>
            </>
          ) : m.status === 'inactive' ? (
            <button
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() => id && handleAction(id, 'enable')}
            >
              {busy ? 'Enabling…' : 'Enable'}
            </button>
          ) : m.status === 'active' ? (
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Up to date</span>
          ) : null}

          <CardMenu label={`More actions for ${name}`}>
            {(close) => (
              <>
                <button
                  type="button"
                  className="module-menu__item"
                  disabled={!id || checkingModules[id]}
                  onClick={() => { close(); if (id) checkModuleUpdate(id, true) }}
                >
                  Check for updates
                </button>
                {m.status === 'active' && (
                  <button
                    type="button"
                    className="module-menu__item"
                    disabled={busy}
                    onClick={() => { close(); if (id) handleAction(id, 'disable') }}
                  >
                    Turn off
                  </button>
                )}
                {m.status === 'inactive' && (
                  <button
                    type="button"
                    className="module-menu__item"
                    disabled={busy}
                    onClick={() => { close(); if (id) handleAction(id, 'enable') }}
                  >
                    Turn on
                  </button>
                )}
                <a className="module-menu__item" href={m.repoUrl} target="_blank" rel="noopener noreferrer">
                  View the code
                </a>

                <div className="module-menu__sep" />
                <div className="module-menu__label">Which releases</div>
                {(['public', 'beta'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="module-menu__item"
                    disabled={!id || channelSaving[id]}
                    onClick={() => { close(); if (id) handleModuleChannelChange(id, c) }}
                  >
                    <span>{c === 'public' ? 'Finished releases' : 'Early (beta) releases'}</span>
                    {channel === c && <span aria-hidden="true">&#10003;</span>}
                  </button>
                ))}

                <div className="module-menu__sep" />
                <button
                  type="button"
                  className="module-menu__item module-menu__item--danger"
                  onClick={() => { close(); openUninstallModal(m) }}
                >
                  Uninstall
                </button>
              </>
            )}
          </CardMenu>
        </div>
      </div>
    )
  }

  function availableCard(m: DirectoryEntry) {
    const name = formatModuleName(m.repoName)
    const checking = installChecking === m.repoUrl
    const busy = actionLoading[m.repoUrl] || checking
    const betaOnly = m.hasPublicRelease === false
    const chosen = betaOnly ? 'beta' : (installChannel[m.repoUrl] ?? 'public')

    return (
      <div key={m.repoUrl} className="card module-card">
        <ModuleArt repoUrl={m.repoUrl} repoName={m.repoName} initial={moduleInitial(m.repoName)} />

        <div className="module-card__body">
          <div className="module-card__name">{name}</div>
          {m.description && <div className="module-card__desc" title={m.description}>{m.description}</div>}
          <div className="module-card__meta">
            {betaOnly
              ? <span className="badge badge-primary">Beta only</span>
              : chosen === 'beta' && <span className="badge badge-primary">Beta</span>}
          </div>
        </div>

        <div className="module-card__foot">
          <button
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={() => { void requestInstall(m.repoUrl) }}
          >
            {checking ? 'Checking…' : busy ? 'Installing…' : chosen === 'beta' ? 'Install beta' : 'Install'}
          </button>

          <CardMenu label={`More actions for ${name}`}>
            {(close) => (
              <>
                <div className="module-menu__label">Which releases</div>
                {betaOnly ? (
                  <button type="button" className="module-menu__item" disabled>
                    <span>Early (beta) releases</span>
                    <span aria-hidden="true">&#10003;</span>
                  </button>
                ) : (
                  (['public', 'beta'] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="module-menu__item"
                      disabled={busy}
                      onClick={() => { close(); setInstallChannel((prev) => ({ ...prev, [m.repoUrl]: c })) }}
                    >
                      <span>{c === 'public' ? 'Finished releases' : 'Early (beta) releases'}</span>
                      {chosen === c && <span aria-hidden="true">&#10003;</span>}
                    </button>
                  ))
                )}
                <div className="module-menu__sep" />
                <a className="module-menu__item" href={m.repoUrl} target="_blank" rel="noopener noreferrer">
                  View the code
                </a>
              </>
            )}
          </CardMenu>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Modules</h1>
          <p style={{ margin: '0.25rem 0 0', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            Add features to your site, and keep the ones you already have current.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {updatableCount > 1 && (
            <button
              className="btn btn-primary btn-sm"
              disabled={updatingAll || deployInFlight}
              title={deployInFlight ? 'A deployment is running - updates resume once it is live' : undefined}
              onClick={handleUpdateAll}
            >
              {updatingAll ? 'Updating all…' : deployInFlight ? 'Deploying…' : `Update all (${updatableCount})`}
            </button>
          )}
          <button className="btn btn-secondary btn-sm" disabled={refreshing || loading} onClick={handleRefresh}>
            {refreshing ? 'Checking…' : 'Check for updates'}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger">
          <div>{error}</div>
          {looksLikeGitHubProblem(error) && (
            <div style={{ marginTop: '0.5rem' }}>
              {GITHUB_OUTAGE_HINT}{' '}
              <a href={GITHUB_STATUS_URL} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>
                GitHub status
              </a>
            </div>
          )}
        </div>
      )}
      {notice && <div className="alert alert-info">{notice}</div>}

      {ghStatus && !ghStatus.hasPat && !ghStatus.connected && (
        <div className="alert alert-warning">
          GitHub is not configured. Module install requires a GitHub connection.{' '}
          <a href="config?tab=integrations">Go to Settings &rarr; Integrations</a> to connect a GitHub App or add a personal access token.
        </div>
      )}

      {ghStatus && !ghStatus.hasPat && ghStatus.connected && !ghStatus.hasInstallation && (
        <div className="alert alert-warning">
          GitHub App is connected but not yet installed on a repository. Module install will fail until you complete the setup.{' '}
          <a href="config?tab=integrations">Go to Settings &rarr; Integrations</a> and click &ldquo;Install app on repository&rdquo;.
        </div>
      )}

      <TabStrip
        style={{ marginBottom: '1.5rem' }}
        items={[
          { key: 'installed', label: tabLabel('Installed', installed.length), active: activeTab === 'installed', onClick: () => selectTab('installed') },
          { key: 'updates', label: tabLabel('Updates available', updatableCount, 'badge-yellow'), active: activeTab === 'updates', onClick: () => selectTab('updates') },
          { key: 'browse', label: tabLabel('Browse', available.length), active: activeTab === 'browse', onClick: () => selectTab('browse') },
          { key: 'custom', label: 'Add your own', active: activeTab === 'custom', onClick: () => selectTab('custom') },
        ]}
        trailing={activeTab === 'custom' ? undefined : (
          <input
            className="module-search"
            type="search"
            placeholder="Search modules"
            aria-label="Search modules"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
      />

      {activeTab === 'installed' && (
        loading ? <LoadingGrid /> :
        installed.length === 0 ? (
          <EmptyState title="No modules yet">
            Nothing installed so far. Have a look through <button type="button" className="btn-link" onClick={() => selectTab('browse')}>Browse</button> and
            pick out whatever your site could do with.
          </EmptyState>
        ) : shownInstalled.length === 0 ? (
          <EmptyState title="Nothing matched">None of your installed modules match &ldquo;{query.trim()}&rdquo;.</EmptyState>
        ) : (
          <div className="module-grid">{shownInstalled.map(installedCard)}</div>
        )
      )}

      {activeTab === 'updates' && (
        loading ? <LoadingGrid /> :
        updatableCount === 0 ? (
          <EmptyState title="Everything is current">
            Every installed module is on its latest release. Nothing for you to do, which is the ideal state of affairs.
          </EmptyState>
        ) : shownUpdatable.length === 0 ? (
          <EmptyState title="Nothing matched">No module waiting for an update matches &ldquo;{query.trim()}&rdquo;.</EmptyState>
        ) : (
          <div className="module-grid">{shownUpdatable.map(installedCard)}</div>
        )
      )}

      {activeTab === 'browse' && (
        loading ? <LoadingGrid /> :
        directoryUnavailable ? (
          <div className="alert alert-warning">Module directory is currently unavailable.</div>
        ) : available.length === 0 ? (
          <EmptyState title="You have the lot">
            Every module in the directory is already installed. Impressive, if slightly alarming.
          </EmptyState>
        ) : shownAvailable.length === 0 ? (
          <EmptyState title="Nothing matched">No module in the directory matches &ldquo;{query.trim()}&rdquo;.</EmptyState>
        ) : (
          <div className="module-grid">{shownAvailable.map(availableCard)}</div>
        )
      )}

      {activeTab === 'custom' && (
        <div className="card" style={{ maxWidth: 560 }}>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginTop: 0 }}>
            Install a module from any GitHub repository, including a private one in your own account. It needs a{' '}
            <code>cactus.module.json</code> manifest and at least one published release. For a private repository,
            grant this site&rsquo;s GitHub App access to it first.
          </p>
          <div className="field">
            <label htmlFor="custom-module-url">Repository URL</label>
            <input
              id="custom-module-url"
              type="url"
              placeholder="https://github.com/your-account/your-module"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              disabled={customBusy}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Channel</span>
            <div style={{
              display: 'inline-flex', padding: 2, gap: 2,
              background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)',
            }}>
              {(['public', 'beta'] as const).map((channel) => (
                <button
                  key={channel}
                  type="button"
                  disabled={customBusy}
                  onClick={() => setCustomChannel(channel)}
                  style={{
                    border: 'none', borderRadius: 'var(--radius-full)', padding: '0.25rem 0.75rem',
                    fontSize: 'var(--text-sm)', fontWeight: 500, cursor: 'pointer',
                    background: customChannel === channel ? 'var(--color-primary)' : 'transparent',
                    color: customChannel === channel ? 'var(--color-on-primary)' : 'var(--color-text-muted)',
                  }}
                >
                  {channel === 'public' ? 'Public' : 'Beta'}
                </button>
              ))}
            </div>
          </div>
          <button
            className="btn btn-primary btn-sm"
            disabled={!customUrl.trim() || customBusy}
            onClick={handleCustomInstall}
          >
            {installChecking === customUrl.trim() ? 'Checking…' : actionLoading[customUrl.trim()] ? 'Installing…' : customChannel === 'beta' ? 'Install beta' : 'Install'}
          </button>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: 0, marginTop: '1rem' }}>
            Worth saying plainly: a module runs as part of the site itself, database and all. Installing one from a
            pasted address means trusting whoever wrote it - the directory implies a little vetting, this box implies
            none. If in doubt, don&rsquo;t.
          </p>
        </div>
      )}

      {/* Install modal - only ever shown when there is something else to bring along */}
      {installModal && (() => {
        const busy = actionLoading[installModal.repoUrl] ?? false
        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Install ${installModal.name}`}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onClick={(e) => { if (e.target === e.currentTarget && !busy) setInstallModal(null) }}
          >
            <div className="card" style={{ maxWidth: '480px', width: '100%', margin: '1rem' }}>
              <h2 className="card-title">Install {installModal.name}</h2>
              <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                Installing takes one deployment. Anything you tick here goes out in the same one, so you
                wait once instead of three times.
              </p>

              {coreUpdate && (
                <label style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start', marginBottom: '0.75rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={bundleCore}
                    disabled={busy}
                    onChange={(e) => setBundleCore(e.target.checked)}
                    style={{ marginTop: '0.2rem' }}
                  />
                  <span style={{ fontSize: 'var(--text-sm)' }}>
                    Also update Cactus to v{coreUpdate.latestVersion.replace(/^v/i, '')}
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '0.15rem' }}>
                      This site is on v{coreUpdate.currentVersion.replace(/^v/i, '')}
                    </div>
                  </span>
                </label>
              )}

              {updatableCount > 0 && (
                <label style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start', marginBottom: '0.75rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={bundleModules}
                    disabled={busy}
                    onChange={(e) => setBundleModules(e.target.checked)}
                    style={{ marginTop: '0.2rem' }}
                  />
                  <span style={{ fontSize: 'var(--text-sm)' }}>
                    Also update {updatableCount === 1 ? 'the module' : `all ${updatableCount} modules`} with updates waiting
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '0.15rem' }}>
                      {updatable.map((m) => `${formatModuleName(m.repoName)} → ${showVersion(m.updateAvailable)}`).join(', ')}
                    </div>
                  </span>
                </label>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <button className="btn btn-secondary" disabled={busy} onClick={() => setInstallModal(null)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => performInstall(installModal.repoUrl, installModal.channel, {
                    updateCore: coreUpdate !== null && bundleCore,
                    updateModules: updatableCount > 0 && bundleModules,
                  })}
                >
                  {busy ? 'Installing…' : installModal.channel === 'beta' ? 'Install beta' : 'Install'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

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

            {/* Removing a module costs a deployment whatever else is waiting, so offer
                the same "bring it along" boxes the install dialog does. Fenced off from
                the destructive choice above, since ticking one of these is nothing like
                choosing to drop tables. */}
            {(uninstallChecking || coreUpdate || uninstallUpdatable.length > 0) && (
              <div
                style={{
                  borderTop: '1px solid var(--color-border)',
                  paddingTop: '1rem',
                  marginBottom: '1.5rem',
                }}
              >
                {uninstallChecking ? (
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: 0 }}>
                    Checking whether anything else is waiting to go out…
                  </p>
                ) : (
                  <>
                    <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginTop: 0, marginBottom: '0.75rem' }}>
                      Removing this takes one deployment. Anything you tick here goes out in the same
                      one, so you wait once instead of three times.
                    </p>

                    {coreUpdate && (
                      <label style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start', marginBottom: '0.75rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={bundleCore}
                          disabled={uninstalling}
                          onChange={(e) => setBundleCore(e.target.checked)}
                          style={{ marginTop: '0.2rem' }}
                        />
                        <span style={{ fontSize: 'var(--text-sm)' }}>
                          Also update Cactus to v{coreUpdate.latestVersion.replace(/^v/i, '')}
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '0.15rem' }}>
                            This site is on v{coreUpdate.currentVersion.replace(/^v/i, '')}
                          </div>
                        </span>
                      </label>
                    )}

                    {uninstallUpdatable.length > 0 && (
                      <label style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={bundleModules}
                          disabled={uninstalling}
                          onChange={(e) => setBundleModules(e.target.checked)}
                          style={{ marginTop: '0.2rem' }}
                        />
                        <span style={{ fontSize: 'var(--text-sm)' }}>
                          Also update {uninstallUpdatable.length === 1 ? 'the module' : `all ${uninstallUpdatable.length} modules`} with updates waiting
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '0.15rem' }}>
                            {uninstallUpdatable.map((m) => `${formatModuleName(m.repoName)} → ${showVersion(m.updateAvailable)}`).join(', ')}
                          </div>
                        </span>
                      </label>
                    )}
                  </>
                )}
              </div>
            )}

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

      {/* Prerequisite modal - Cactus too old, a sibling module too old, and
          anything else the API refuses with a *_required code. */}
      {prerequisiteModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={prerequisiteModal.title}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setPrerequisiteModal(null) }}
        >
          <div className="card" style={{ maxWidth: '480px', width: '100%', margin: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1rem' }}>
              <h2 className="card-title" style={{ margin: 0 }}>{prerequisiteModal.title}</h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setPrerequisiteModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', lineHeight: 1, color: 'var(--color-text-muted)' }}
              >
                &times;
              </button>
            </div>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
              {prerequisiteModal.message}
            </p>
            {(() => {
              // The waiting Cactus update is new enough to satisfy the module, so the
              // answer to "update Cactus first" is a button, not an errand: it goes out
              // with the install in one deployment.
              const retry = prerequisiteModal.retry
              const canFixHere = retry && coreUpdate && compareVersions(coreUpdate.latestVersion, retry.requiredVersion) >= 0
              const busy = retry ? (actionLoading[retry.repoUrl] ?? false) : false
              return (
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary" disabled={busy} onClick={() => setPrerequisiteModal(null)}>
                    {prerequisiteModal.updatePanel ? 'Cancel' : 'Close'}
                  </button>
                  {prerequisiteModal.updatePanel && !canFixHere && (
                    <a className="btn btn-primary" href="config?tab=general">
                      Go to update panel
                    </a>
                  )}
                  {canFixHere && retry && (
                    <button
                      className="btn btn-primary"
                      disabled={busy}
                      onClick={() => {
                        setPrerequisiteModal(null)
                        // Core only: the button promises Cactus and the install, and
                        // sweeping the other modules in unasked is not what it says.
                        void performInstall(retry.repoUrl, retry.channel, { updateCore: true })
                      }}
                    >
                      {busy ? 'Installing…' : `Update Cactus and install`}
                    </button>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
