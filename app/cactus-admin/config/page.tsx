'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import type { MediaProviderType } from '@prisma/client'
import {
  PROVIDER_KIND,
  PROVIDER_LABELS,
  PROVIDER_ENV_VARS,
  CLOUDFLARE_WORKER_VAR,
  ALL_PROVIDERS,
  envKeysForProvider,
} from '@/lib/media/providers'
import type { ConsentBannerConfig, ConsentCategory } from '@/lib/consent/types'
import { DEFAULT_CONSENT_BANNER_CONFIG } from '@/lib/consent/types'

type SiteConfig = {
  siteName: string; tagline: string; description: string;
  timezone: string; locale: string; dateFormat: string; timeFormat: string;
  adminPath: string; status: string; hideFromCrawlers: boolean;
  publicRegistration: boolean; trustDeviceDays: number;
  emailFromName: string; emailFromAddress: string; emailProvider: string;
  mediaProvider: MediaProviderType | null;
  privacyPolicyPageId: string; termsPageId: string;
  sessionPurgeAfterDays: number; recoveryPurgeAfterDays: number;
  mainMenuId: string | null;
  homepageId: string | null;
  consentBannerConfig: ConsentBannerConfig | null;
}

type InfoPage = { id: string; title: string }
type MenuOption = { id: string; name: string }

const TABS = ['general', 'branding', 'access', 'email', 'media', 'status', 'gdpr', 'integrations'] as const
type Tab = typeof TABS[number]

// Env var sections: each section has a label, description, and its managed keys.
type EnvSection = {
  id: string
  label: string
  description: string
  keys: Array<{ key: string; label: string; type?: 'text' | 'password'; placeholder?: string; hint?: React.ReactNode }>
}

const EMAIL_BREVO_SECTION: EnvSection = {
  id: 'email-brevo',
  label: 'Brevo',
  description: 'Transactional email via Brevo API',
  keys: [
    { key: 'BREVO_API_KEY', label: 'BREVO_API_KEY', type: 'password', placeholder: 'xkeysib-…', hint: <a href="https://app.brevo.com/settings/keys/api" target="_blank" rel="noopener noreferrer">Create at brevo.com → Settings → API Keys</a> },
  ],
}

const EMAIL_SMTP_SECTION: EnvSection = {
  id: 'email-smtp',
  label: 'SMTP',
  description: 'Transactional email via SMTP',
  keys: [
    { key: 'SMTP_HOST', label: 'SMTP_HOST', placeholder: 'smtp.example.com' },
    { key: 'SMTP_PORT', label: 'SMTP_PORT', placeholder: '587' },
    { key: 'SMTP_USER', label: 'SMTP_USER', placeholder: 'you@example.com' },
    { key: 'SMTP_PASS', label: 'SMTP_PASS', type: 'password', placeholder: '••••••••' },
  ],
}

// Provider dropdown options grouped by kind.
const PROXIED_PROVIDERS = ALL_PROVIDERS.filter((p) => PROVIDER_KIND[p] === 'PROXIED')
const DIRECT_PROVIDERS = ALL_PROVIDERS.filter((p) => PROVIDER_KIND[p] === 'DIRECT')

type MigrationJob = {
  id: string
  toProvider: MediaProviderType
  status: string
  totalItems: number
  migratedItems: number
  failedItemIds: Array<{ id: string; error: string }>
  cursor: string | null
}

const INTEGRATION_SECTIONS: EnvSection[] = [
  {
    id: 'github-pat',
    label: 'GitHub - legacy personal access token (fallback)',
    description: 'Still works if you prefer a PAT. Prefer connecting a GitHub App above.',
    keys: [
      { key: 'GITHUB_API_TOKEN', label: 'GITHUB_API_TOKEN', type: 'password', placeholder: 'ghp_…', hint: 'GitHub → Settings → Developer settings → Personal access tokens' },
    ],
  },
  {
    id: 'edge-config',
    label: 'Edge Config',
    description: 'Fast global reads for admin path and site status (recommended for production)',
    keys: [
      { key: 'EDGE_CONFIG', label: 'EDGE_CONFIG', type: 'password', placeholder: 'https://edge-config.vercel.com/…' },
      { key: 'VERCEL_EDGE_CONFIG_ID', label: 'VERCEL_EDGE_CONFIG_ID', placeholder: 'ecfg_…' },
    ],
  },
  {
    id: 'turnstile',
    label: 'Cloudflare Turnstile',
    description: 'Bot protection on public forms',
    keys: [
      { key: 'TURNSTILE_SITE_KEY', label: 'TURNSTILE_SITE_KEY', placeholder: 'Site key' },
      { key: 'TURNSTILE_SECRET_KEY', label: 'TURNSTILE_SECRET_KEY', type: 'password', placeholder: 'Secret key' },
    ],
  },
  {
    id: 'webhook',
    label: 'Vercel Deployment Webhooks',
    description: 'Real-time deployment status for module/theme installs (Pro/Enterprise only)',
    keys: [
      { key: 'VERCEL_WEBHOOK_SECRET', label: 'VERCEL_WEBHOOK_SECRET', type: 'password', placeholder: 'Webhook secret' },
    ],
  },
  {
    id: 'sentry',
    label: 'Sentry',
    description: 'Error reporting; logs to Vercel functions if unset',
    keys: [
      { key: 'SENTRY_DSN', label: 'SENTRY_DSN', placeholder: 'https://…@sentry.io/…' },
    ],
  },
  {
    id: 'neon',
    label: 'Neon (auto database provisioning)',
    description: 'Lets Cactus Foundation create a Postgres database automatically during setup',
    keys: [
      { key: 'NEON_API_KEY', label: 'NEON_API_KEY', type: 'password', placeholder: 'Neon API key' },
    ],
  },
]

function StatusBadge({ set }: { set: boolean }) {
  return (
    <span className={set ? 'badge badge-success' : 'badge badge-default'}>
      {set ? '● Set' : '○ Not set'}
    </span>
  )
}

type CoreUpdateStatus =
  | { localMode: true; currentVersion: string }
  | { configured: false }
  | { configured: true; error: string }
  | {
      configured: true
      currentVersion: string
      latestVersion: string
      updateAvailable: boolean
      releaseNotesHtml: string
      latestUrl: string
      publishedAt: string | null
    }

function UpdatesPanel() {
  const [status, setStatus] = useState<CoreUpdateStatus | null>(null)
  const [showNotes, setShowNotes] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState('')

  useEffect(() => {
    fetch('/api/admin/updates')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setStatus(d as CoreUpdateStatus) })
      .catch(() => {})
  }, [])

  async function handleUpdate() {
    setUpdating(true)
    setUpdateError('')
    try {
      const res = await fetch('/api/admin/updates', { method: 'POST' })
      const d = (await res.json()) as { ok?: boolean; redeployTriggered?: boolean; error?: string }
      if (!res.ok) throw new Error(d.error ?? 'Update failed')
      if (d.redeployTriggered) {
        window.location.assign('/cactus-status/redeploying')
        return
      }
    } catch (err: unknown) {
      setUpdateError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setUpdating(false)
    }
  }

  if (!status) return null

  if ('localMode' in status) {
    return (
      <div style={{ marginBottom: '1.5rem' }}>
        <div className="alert alert-info" style={{ fontSize: '0.875rem' }}>
          You&rsquo;re running in local-development mode (v{status.currentVersion}). Core updates ship via git and a
          Vercel redeploy, so they&rsquo;re managed outside the admin here - pull the latest Cactus Foundation release
          and redeploy to update.
        </div>
        <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '1.5rem 0 0' }} />
      </div>
    )
  }

  if (!status.configured) {
    return (
      <div style={{ marginBottom: '1.5rem' }}>
        <div className="alert alert-info" style={{ fontSize: '0.875rem' }}>
          Automatic updates require GitHub to be configured. Connect a GitHub App or set{' '}
          <code>GITHUB_API_TOKEN</code> in{' '}
          <a href="?tab=integrations" style={{ color: 'var(--color-primary)' }}>Settings → Integrations</a>.
        </div>
        <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '1.5rem 0 0' }} />
      </div>
    )
  }

  if ('error' in status) {
    return (
      <div style={{ marginBottom: '1.5rem' }}>
        <div className="alert alert-warning" style={{ fontSize: '0.875rem' }}>
          Couldn&rsquo;t check for updates right now. Please try again later.
        </div>
        <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '1.5rem 0 0' }} />
      </div>
    )
  }

  if (!status.updateAvailable) {
    return (
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1.5rem' }}>
          <span className="badge badge-success">Up to date</span>
          <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
            You&rsquo;re on v{status.currentVersion} — the latest release.
          </span>
        </div>
        <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '0 0 1.5rem' }} />
      </div>
    )
  }

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div className="card" style={{ borderColor: 'var(--color-primary)', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
          <div>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: 600 }}>
              Update available
            </h2>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
              v{status.currentVersion} &rarr; <strong>v{status.latestVersion}</strong>{' '}
              <span className="badge" style={{ fontSize: '0.7rem', marginLeft: '0.25rem' }}>new</span>
            </p>
          </div>
          <a
            href={status.latestUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}
          >
            View on GitHub →
          </a>
        </div>

        {status.releaseNotesHtml && (
          <div style={{ marginBottom: '0.75rem' }}>
            <button
              type="button"
              onClick={() => setShowNotes((s) => !s)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '0.875rem', color: 'var(--color-primary)', fontFamily: 'inherit' }}
            >
              {showNotes ? 'Hide' : "What's new"} {showNotes ? '▲' : '▼'}
            </button>
            {showNotes && (
              <div
                style={{ marginTop: '0.625rem', border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.75rem 1rem', maxHeight: '16rem', overflowY: 'auto', fontSize: '0.8125rem', lineHeight: 1.6 }}
                dangerouslySetInnerHTML={{ __html: status.releaseNotesHtml }}
              />
            )}
          </div>
        )}

        {updateError && (
          <div className="alert alert-danger" style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>
            {updateError}
          </div>
        )}

        {!showConfirm && (
          <button className="btn btn-primary" style={{ fontSize: '0.875rem' }} onClick={() => setShowConfirm(true)}>
            Update now
          </button>
        )}

        {showConfirm && (
          <div className="card" style={{ marginTop: '0.5rem', background: 'var(--color-bg-subtle)' }}>
            <p style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>
              This will copy the updated core files from the upstream Cactus Foundation repository
              into your GitHub repo and trigger a redeploy. Your modules, content, and database are
              not affected.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                className="btn btn-primary"
                style={{ fontSize: '0.875rem' }}
                disabled={updating}
                onClick={handleUpdate}
              >
                {updating ? 'Updating…' : 'Confirm update'}
              </button>
              <button
                className="btn btn-secondary"
                style={{ fontSize: '0.875rem' }}
                disabled={updating}
                onClick={() => { setShowConfirm(false); setUpdateError('') }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
      <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '0 0 1.5rem' }} />
    </div>
  )
}

function ConfigPageInner() {
  const searchParams = useSearchParams()
  const initialTab = TABS.includes(searchParams.get('tab') as Tab) ? (searchParams.get('tab') as Tab) : 'general'
  const [tab, setTab] = useState<Tab>(initialTab)
  const [config, setConfig] = useState<Partial<SiteConfig>>({})
  const [pages, setPages] = useState<InfoPage[]>([])
  const [menus, setMenus] = useState<MenuOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // Env var state
  const [envStatus, setEnvStatus] = useState<Record<string, boolean>>({})
  const [envFields, setEnvFields] = useState<Record<string, string>>({})
  // Local-development mode: env vars come from .env.local, so the editor is
  // read-only and the Vercel-only "Reset Everything" action is hidden.
  const [localMode, setLocalMode] = useState(false)
  const [savingEnvId, setSavingEnvId] = useState<string | null>(null)
  const [savedEnvId, setSavedEnvId] = useState<string | null>(null)
  const [envError, setEnvError] = useState('')
  const [emailMode, setEmailMode] = useState<'brevo' | 'smtp'>('brevo')

  // Refresh templates state
  const [refreshingTemplates, setRefreshingTemplates] = useState(false)
  const [templatesRefreshed, setTemplatesRefreshed] = useState(false)
  const [templatesRefreshError, setTemplatesRefreshError] = useState('')

  // Reset Everything state
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetDone, setResetDone] = useState(false)
  const [resetDeletedCount, setResetDeletedCount] = useState(0)
  const [resetPartialError, setResetPartialError] = useState('')
  const [resetError, setResetError] = useState('')

  // Reset Database state
  const [showDbResetConfirm, setShowDbResetConfirm] = useState(false)
  const [dbResetting, setDbResetting] = useState(false)
  const [dbResetDone, setDbResetDone] = useState(false)
  const [dbResetError, setDbResetError] = useState('')
  const [dbResetDeleteSetupData, setDbResetDeleteSetupData] = useState(false)
  const [dbResetWasHard, setDbResetWasHard] = useState(false)

  // GitHub App state
  type GhStatus = { encryptionKeySet: boolean; encryptionKeyValid: boolean; connected: boolean; appSlug: string | null; installationAccount: string | null; hasInstallation: boolean; hasPat: boolean }
  const [ghStatus, setGhStatus] = useState<GhStatus | null>(null)
  const [ghBusy, setGhBusy] = useState(false)
  const [ghError, setGhError] = useState('')

  const loadGhStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/github-app')
      if (res.ok) setGhStatus(await res.json())
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- delegating to async helper; all setState calls are after awaits
    if (tab === 'integrations' && !loading) loadGhStatus()
  }, [tab, loading, loadGhStatus])

  useEffect(() => {
    const github = searchParams.get('github')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- delegating to async helper; all setState calls are after awaits
    if (github === 'installed' || github === 'connected') loadGhStatus()
    if (github === 'error') {
      const reason = searchParams.get('reason')
      if (reason === 'encrypt_key_missing') {
        setGhError('ENCRYPTION_KEY is not set. Add it to your Vercel environment variables (Settings → Environment Variables) then redeploy.')
      } else if (reason === 'encrypt_key_format') {
        setGhError('ENCRYPTION_KEY is set but has the wrong format. It must be a 64-character hex string - generate one with: openssl rand -hex 32')
      } else if (reason === 'encrypt_error') {
        setGhError('GitHub App credentials could not be encrypted. Check that ENCRYPTION_KEY is correctly set in Vercel and redeploy.')
      } else if (reason === 'state_mismatch') {
        setGhError('GitHub connection failed: the security state token did not match. Please try again.')
      } else if (reason === 'conversion_failed') {
        setGhError('GitHub rejected the app manifest. Please try again.')
      } else if (reason === 'network') {
        setGhError('Could not reach GitHub to complete the connection. Please try again.')
      } else if (reason === 'db') {
        setGhError('Failed to save the GitHub App credentials to the database. Check your database connection.')
      } else {
        setGhError('Something went wrong during the GitHub connection. Please try again.')
      }
    }
  }, [searchParams, loadGhStatus])

  // GDPR consent banner state
  const [gdprSuggestions, setGdprSuggestions] = useState<string[]>([])

  const loadGdprSuggestions = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/modules')
      if (!res.ok) return
      const data = (await res.json()) as { modules?: Array<{ status: string; manifest?: { cookieCategories?: string[] } | null }> }
      const cats = new Set<string>()
      for (const mod of (data.modules ?? [])) {
        if (mod.status === 'active' && mod.manifest?.cookieCategories) {
          for (const c of mod.manifest.cookieCategories) cats.add(c)
        }
      }
      setGdprSuggestions([...cats])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- delegating to async helper; all setState calls are after awaits
    if (tab === 'gdpr' && !loading) loadGdprSuggestions()
  }, [tab, loading, loadGdprSuggestions])

  // Media provider state
  const [breakdown, setBreakdown] = useState<Record<string, number>>({})
  const [migrationJob, setMigrationJob] = useState<MigrationJob | null>(null)
  const [migrationRunning, setMigrationRunning] = useState(false)
  const [pendingProvider, setPendingProvider] = useState<MediaProviderType | null>(null)
  const [mediaBusy, setMediaBusy] = useState(false)

  const loadMediaState = useCallback(async () => {
    const [bd, ms] = await Promise.all([
      fetch('/api/admin/media/provider-breakdown').then((r) => (r.ok ? r.json() : { breakdown: {} })).catch(() => ({ breakdown: {} })),
      fetch('/api/admin/media/migration-status').then((r) => (r.ok ? r.json() : { job: null })).catch(() => ({ job: null })),
    ])
    setBreakdown((bd as { breakdown?: Record<string, number> }).breakdown ?? {})
    setMigrationJob((ms as { job?: MigrationJob | null }).job ?? null)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- delegating to async helper; all setState calls are after awaits
    if (tab === 'media' && !loading) loadMediaState()
  }, [tab, loading, loadMediaState])

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/config').then((r) => r.json()),
      fetch('/api/admin/pages?perPage=100').then((r) => r.json()),
      fetch('/api/admin/env').then((r) => r.json()),
      fetch('/api/admin/menus').then((r) => r.ok ? r.json() : { menus: [] }).catch(() => ({ menus: [] })),
    ]).then(([cfg, pagesData, envData, menusData]) => {
      setConfig(cfg)
      setPages(pagesData.pages ?? [])
      setMenus((menusData as { menus?: MenuOption[] }).menus ?? [])
      setEnvStatus((envData as { vars?: Record<string, boolean> }).vars ?? {})
      setLocalMode((envData as { localMode?: boolean }).localMode === true)
      // Pre-select SMTP mode if SMTP_HOST is set but BREVO_API_KEY is not
      if ((envData as { vars?: Record<string, boolean> }).vars?.['SMTP_HOST'] && !(envData as { vars?: Record<string, boolean> }).vars?.['BREVO_API_KEY']) {
        setEmailMode('smtp')
      }
      setLoading(false)
    }).catch(() => { setError('Failed to load config'); setLoading(false) })
  }, [])

  async function handleSave() {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Save failed')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveEnv(sectionId: string, keys: string[]) {
    setEnvError('')
    setSavingEnvId(sectionId)
    setSavedEnvId(null)
    try {
      const vars = keys
        .filter((k) => envFields[k]?.trim())
        .map((k) => ({ key: k, value: (envFields[k] ?? '').trim() }))

      if (vars.length === 0) {
        setSavingEnvId(null)
        return
      }

      const res = await fetch('/api/admin/env', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vars }),
      })
      const d = (await res.json()) as { ok?: boolean; error?: string; redeployTriggered?: boolean }
      if (!res.ok) throw new Error(d.error ?? 'Save failed')

      // A redeploy was triggered — hard reload so the proxy picks up the
      // pendingRedeployId sentinel and shows the redeploying screen immediately.
      if (d.redeployTriggered) {
        window.location.reload()
        return
      }

      // Update local status optimistically
      const updated: Record<string, boolean> = { ...envStatus }
      keys.forEach((k) => { if (envFields[k]?.trim()) updated[k] = true })
      setEnvStatus(updated)

      // Clear saved fields (they're now stored in Vercel)
      const cleared: Record<string, string> = { ...envFields }
      keys.forEach((k) => { if (envFields[k]?.trim()) cleared[k] = '' })
      setEnvFields(cleared)

      setSavedEnvId(sectionId)
      setTimeout(() => setSavedEnvId(null), 3000)
    } catch (err: unknown) {
      setEnvError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSavingEnvId(null)
    }
  }

  async function handleRefreshTemplates() {
    setRefreshingTemplates(true)
    setTemplatesRefreshError('')
    setTemplatesRefreshed(false)
    try {
      const res = await fetch('/api/setup/complete', { method: 'POST' })
      const d = (await res.json()) as { templatesRefreshed?: boolean; error?: string }
      if (!res.ok) throw new Error(d.error ?? 'Refresh failed')
      setTemplatesRefreshed(true)
    } catch (e) {
      setTemplatesRefreshError(e instanceof Error ? e.message : 'Refresh failed')
    } finally {
      setRefreshingTemplates(false)
    }
  }

  async function handleDbReset() {
    setDbResetting(true)
    setDbResetError('')
    try {
      const res = await fetch('/api/admin/reset-database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteSetupData: dbResetDeleteSetupData }),
      })
      const d = (await res.json()) as { ok?: boolean; error?: string; redirectToSetup?: boolean }
      if (!res.ok) throw new Error(d.error ?? 'Reset failed')
      setShowDbResetConfirm(false)
      setDbResetWasHard(dbResetDeleteSetupData)
      setDbResetDone(true)
      if (d.redirectToSetup) {
        setTimeout(() => { window.location.href = '/setup' }, 2000)
      }
    } catch (err: unknown) {
      setDbResetError(err instanceof Error ? err.message : 'Reset failed')
    } finally {
      setDbResetting(false)
    }
  }

  function set(key: keyof SiteConfig, value: unknown) {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  function setConsent(updates: Partial<ConsentBannerConfig>) {
    setConfig((prev) => ({
      ...prev,
      consentBannerConfig: { ...(prev.consentBannerConfig ?? DEFAULT_CONSENT_BANNER_CONFIG), ...updates },
    }))
  }

  // Drives the batch endpoint repeatedly until the job finishes or is cancelled,
  // refreshing progress each round. The admin must keep this screen open.
  const runMigrationLoop = useCallback(async () => {
    setMigrationRunning(true)
    try {
       
      while (true) {
        const res = await fetch('/api/admin/media/migration-batch', { method: 'POST' })
        if (!res.ok) break
        const result = (await res.json()) as { done: boolean; status: string }
        await loadMediaState()
        if (result.done || result.status === 'cancelled' || result.status === 'none') break
        // Re-read job to honour a mid-flight cancel.
        const status = await fetch('/api/admin/media/migration-status').then((r) => r.json()).catch(() => ({ job: null }))
        if (!status.job || status.job.status === 'cancelled') break
      }
    } finally {
      setMigrationRunning(false)
      await loadMediaState()
    }
  }, [loadMediaState])

  // Resume an already-running job if the admin reopens the tab.
  useEffect(() => {
    if (tab === 'media' && migrationJob && (migrationJob.status === 'running' || migrationJob.status === 'pending') && !migrationRunning) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resuming an in-progress migration loop; all mutations happen in the async loop body
      runMigrationLoop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [migrationJob?.status, tab])

  async function persistProvider(provider: MediaProviderType): Promise<Record<string, number>> {
    const res = await fetch('/api/admin/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediaProvider: provider }),
    })
    const d = (await res.json()) as { ok?: boolean; breakdown?: Record<string, number>; error?: string }
    if (!res.ok) throw new Error(d.error ?? 'Failed to save provider')
    set('mediaProvider', provider)
    return d.breakdown ?? {}
  }

  async function handleProviderSelect(provider: MediaProviderType) {
    setEnvError('')
    setMediaBusy(true)
    try {
      const bd = await persistProvider(provider)
      setBreakdown(bd)
      // Are there rows on a provider other than the one just selected?
      const strays = Object.entries(bd).filter(([p, n]) => p !== provider && n > 0)
      if (strays.length > 0) {
        setPendingProvider(provider) // open the migrate / switch dialog
      } else {
        setPendingProvider(null)
      }
    } catch (err) {
      setEnvError(err instanceof Error ? err.message : 'Failed to save provider')
    } finally {
      setMediaBusy(false)
    }
  }

  async function confirmMigrateNow() {
    setMediaBusy(true)
    try {
      const res = await fetch('/api/admin/media/migration-start', { method: 'POST' })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Failed to start migration')
      }
      setPendingProvider(null)
      await loadMediaState()
      await runMigrationLoop()
    } catch (err) {
      setEnvError(err instanceof Error ? err.message : 'Failed to start migration')
    } finally {
      setMediaBusy(false)
    }
  }

  async function cancelMigration() {
    await fetch('/api/admin/media/migration-cancel', { method: 'POST' }).catch(() => {})
    await loadMediaState()
  }

  async function retryMigration() {
    setMediaBusy(true)
    try {
      await fetch('/api/admin/media/migration-retry', { method: 'POST' })
      await loadMediaState()
      await runMigrationLoop()
    } finally {
      setMediaBusy(false)
    }
  }

  function setEnvField(key: string, value: string) {
    setEnvFields((prev) => ({ ...prev, [key]: value }))
  }

  if (loading) return <p>Loading…</p>

  const tabLabels: Record<Tab, string> = {
    general: 'General', branding: 'Branding', access: 'Auth & Access',
    email: 'Email', media: 'Media', status: 'Site Status', gdpr: 'GDPR & Legal', integrations: 'Integrations',
  }

  const isEnvSectionSet = (keys: string[]) => keys.some((k) => envStatus[k])

  function GitHubAppCard() {
    const adminPath = config.adminPath ?? ''

    async function handleConnect() {
      setGhBusy(true)
      setGhError('')
      try {
        const res = await fetch(`/${adminPath}/integrations/github/start`)
        if (!res.ok) {
          const d = await res.json().catch(() => ({})) as { error?: string }
          setGhError(d.error ?? 'Failed to start GitHub App flow')
          setGhBusy(false)
          return
        }
        const { formActionUrl, manifest, state } = await res.json() as { formActionUrl: string; manifest: unknown; state: string }
        const form = document.createElement('form')
        form.method = 'post'
        form.action = `${formActionUrl}?state=${encodeURIComponent(state)}`
        const input = document.createElement('input')
        input.type = 'hidden'
        input.name = 'manifest'
        input.value = JSON.stringify(manifest)
        form.appendChild(input)
        document.body.appendChild(form)
        form.submit()
      } catch {
        setGhError('Failed to start GitHub App flow')
        setGhBusy(false)
      }
    }

    async function handleInstall() {
      setGhBusy(true)
      setGhError('')
      try {
        const res = await fetch(`/${adminPath}/integrations/github/install`)
        if (!res.ok) { setGhError('Failed to get install URL'); setGhBusy(false); return }
        const { installUrl } = await res.json() as { installUrl: string }
        window.location.href = installUrl
      } catch {
        setGhError('Failed to get install URL')
        setGhBusy(false)
      }
    }

    async function handleDisconnect() {
      setGhBusy(true)
      setGhError('')
      try {
        const res = await fetch(`/${adminPath}/integrations/github/disconnect`, { method: 'POST' })
        if (!res.ok) { setGhError('Failed to disconnect'); setGhBusy(false); return }
        await loadGhStatus()
      } catch {
        setGhError('Failed to disconnect')
      }
      setGhBusy(false)
    }

    const gh = ghStatus

    return (
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
          <div>
            <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem' }}>GitHub App</h3>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: 0 }}>Connect a GitHub App for fine-grained, auto-rotating access to your repository</p>
          </div>
          <StatusBadge set={!!(gh?.connected && gh.hasInstallation)} />
        </div>

        {ghError && <div className="alert alert-danger" style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>{ghError}</div>}

        {!gh && (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Loading…</p>
        )}

        {gh && !gh.encryptionKeySet && (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            Set <code>ENCRYPTION_KEY</code> (generate with <code>openssl rand -hex 32</code>) to enable the GitHub App flow.
          </p>
        )}

        {gh && gh.encryptionKeySet && !gh.encryptionKeyValid && (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-destructive)', marginBottom: 0 }}>
            ENCRYPTION_KEY is set but has the wrong format. It must be a 64-character hex string.
            Generate a valid one with <code>openssl rand -hex 32</code> and save it in your Vercel
            environment variables, then redeploy.
          </p>
        )}

        {gh && gh.encryptionKeySet && gh.encryptionKeyValid && !gh.connected && (
          <div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>No GitHub App connected. Click below to create and install one in about 30 seconds.</p>
            <button className="btn btn-primary" style={{ fontSize: '0.875rem' }} disabled={ghBusy} onClick={handleConnect}>
              {ghBusy ? 'Opening GitHub…' : 'Connect a GitHub App'}
            </button>
          </div>
        )}

        {gh && gh.encryptionKeySet && gh.connected && !gh.hasInstallation && (
          <div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
              App <strong>{gh.appSlug}</strong> created. Now install it on your repository to grant access.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" style={{ fontSize: '0.875rem' }} disabled={ghBusy} onClick={handleInstall}>
                {ghBusy ? 'Opening GitHub…' : 'Install app on repository'}
              </button>
              <button className="btn btn-secondary" style={{ fontSize: '0.875rem' }} disabled={ghBusy} onClick={handleDisconnect}>
                Start over
              </button>
            </div>
          </div>
        )}

        {gh && gh.encryptionKeySet && gh.connected && gh.hasInstallation && (
          <div>
            <p style={{ fontSize: 'var(--text-sm)', marginBottom: '0.75rem' }}>
              Connected as <strong>{gh.appSlug}</strong>, installed on <strong>{gh.installationAccount ?? 'your account'}</strong>.
            </p>
            <button className="btn btn-danger" style={{ fontSize: '0.875rem' }} disabled={ghBusy} onClick={handleDisconnect}>
              {ghBusy ? 'Disconnecting…' : 'Disconnect'}
            </button>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginTop: '0.5rem', marginBottom: 0 }}>
              Disconnecting removes the credentials from this database. The GitHub App itself remains on your GitHub account.
            </p>
          </div>
        )}
      </div>
    )
  }

  function EnvSectionCard({ section }: { section: EnvSection }) {
    const allKeys = section.keys.map((f) => f.key)
    const hasEntries = allKeys.some((k) => envFields[k]?.trim())
    const isSaving = savingEnvId === section.id
    const isSaved = savedEnvId === section.id

    return (
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
          <div>
            <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem' }}>{section.label}</h3>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: 0 }}>{section.description}</p>
          </div>
          <StatusBadge set={isEnvSectionSet(allKeys)} />
        </div>
        {localMode && (
          <div className="alert alert-info" style={{ fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
            Managed via <code>.env.local</code> in local-development mode. Edit the file and restart the dev server to change these.
          </div>
        )}
        {section.keys.map((f) => (
          <div className="field" key={f.key}>
            <label style={{ fontSize: '0.875rem', display: 'flex', justifyContent: 'space-between' }}>
              <code>{f.key}</code>
              {envStatus[f.key] && <StatusBadge set />}
            </label>
            <input
              type={f.type ?? 'text'}
              autoComplete="off"
              value={envFields[f.key] ?? ''}
              onChange={(e) => setEnvField(f.key, e.target.value)}
              placeholder={localMode ? (envStatus[f.key] ? 'Set in .env.local' : 'Not set') : (envStatus[f.key] ? 'Enter new value to change' : (f.placeholder ?? ''))}
              disabled={localMode}
              style={{ fontSize: '0.875rem' }}
            />
            {f.hint && <span className="field-hint">{f.hint}</span>}
          </div>
        ))}
        {!localMode && (
          <>
            {envError && savingEnvId === null && savedEnvId === null && (
              <div className="alert alert-danger" style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>{envError}</div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button
                className="btn btn-primary"
                style={{ fontSize: '0.875rem' }}
                disabled={isSaving || !hasEntries}
                onClick={() => handleSaveEnv(section.id, allKeys)}
              >
                {isSaving ? 'Saving…' : isSaved ? '✓ Saved' : 'Save credentials'}
              </button>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{isSaved ? 'Redeploying…' : 'Takes effect on next deployment'}</span>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save changes'}
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--color-border)', marginBottom: '2rem', overflowX: 'auto' }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '0.625rem 1rem', border: 'none', background: 'none',
            borderBottom: t === tab ? '2px solid var(--color-primary)' : '2px solid transparent',
            color: t === tab ? 'var(--color-primary)' : 'var(--color-text-muted)', fontWeight: t === tab ? 600 : 400,
            cursor: 'pointer', fontFamily: 'inherit', fontSize: 'var(--text-base)', whiteSpace: 'nowrap',
          }}>
            {tabLabels[t]}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <div>
          <UpdatesPanel />
          <div className="field"><label>Site name</label><input value={config.siteName ?? ''} onChange={(e) => set('siteName', e.target.value)} /></div>
          <div className="field"><label>Tagline</label><input value={config.tagline ?? ''} onChange={(e) => set('tagline', e.target.value)} /></div>
          <div className="field"><label>Description</label><textarea value={config.description ?? ''} onChange={(e) => set('description', e.target.value)} rows={3} /></div>
          <div className="field">
            <label>Homepage</label>
            <select
              value={config.homepageId ?? ''}
              onChange={(e) => set('homepageId', e.target.value || null)}
            >
              <option value="">— None —</option>
              {pages.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
            <span className="field-hint">The info page shown at the root URL (/).</span>
          </div>
          <div className="field">
            <label>Main menu</label>
            {menus.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <select disabled style={{ flex: 1 }}>
                  <option>No menus created yet</option>
                </select>
                <a href={`/${config.adminPath ?? ''}/menus`} style={{ fontSize: '0.875rem', color: 'var(--color-primary)', whiteSpace: 'nowrap' }}>
                  Create a menu first
                </a>
              </div>
            ) : (
              <select
                value={config.mainMenuId ?? ''}
                onChange={(e) => set('mainMenuId', e.target.value || null)}
              >
                <option value="">— None (header will be empty) —</option>
                {menus.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            )}
            <span className="field-hint">The menu shown in the site header navigation.</span>
          </div>
          <div className="field">
            <span className="field-hint">Header and footer are designed in <strong>Appearance</strong>. Layouts are managed under <strong>Layouts</strong>.</span>
          </div>
          <div className="field">
            <label>Timezone</label>
            <select value={config.timezone ?? 'UTC'} onChange={(e) => set('timezone', e.target.value)}>
              {['UTC','Europe/London','Europe/Paris','Europe/Berlin','America/New_York','America/Chicago','America/Los_Angeles','Asia/Tokyo','Australia/Sydney'].map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
          <div className="field"><label>Date format</label><input value={config.dateFormat ?? 'DD/MM/YYYY'} onChange={(e) => set('dateFormat', e.target.value)} /></div>
          <div className="field"><label>Time format</label><input value={config.timeFormat ?? 'HH:mm'} onChange={(e) => set('timeFormat', e.target.value)} /></div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '2rem 0 1.5rem' }} />
          <div style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>Starter templates</h2>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
              Updates the built-in starter layouts (header, footer, page layouts) to the latest versions. Your custom layouts and content are not affected.
            </p>
            {templatesRefreshed && (
              <div className="alert alert-success" style={{ marginBottom: '1rem', fontSize: '0.875rem' }}>
                Starter templates updated. Reload Layouts to see changes.
              </div>
            )}
            {templatesRefreshError && (
              <div className="alert alert-danger" style={{ marginBottom: '1rem', fontSize: '0.875rem' }}>{templatesRefreshError}</div>
            )}
            <button
              className="btn btn-secondary"
              disabled={refreshingTemplates}
              onClick={handleRefreshTemplates}
            >
              {refreshingTemplates ? 'Updating…' : 'Refresh Starter Templates'}
            </button>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '2rem 0 1.5rem' }} />
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1.5rem', color: 'var(--color-destructive)' }}>Danger zone</h2>

            <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '0.25rem' }}>Reset Database</h3>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
              Permanently removes all data from the database — every user, page, layout, menu, and media record. The site returns to fresh-install state and you will be taken to the setup wizard.
            </p>
            {!showDbResetConfirm && !dbResetDone && (
              <button className="btn btn-danger" style={{ marginBottom: '1.5rem' }} onClick={() => setShowDbResetConfirm(true)}>
                Reset Database
              </button>
            )}
            {showDbResetConfirm && !dbResetDone && (
              <div className="card" style={{ borderColor: 'var(--color-destructive)', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', color: 'var(--color-destructive)' }}>Are you absolutely sure?</h3>
                <p style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>
                  This will <strong>permanently delete all content</strong> from the database — every page, layout, menu, media record, and other user accounts. This cannot be undone.
                </p>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '1rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                  <input
                    type="checkbox"
                    style={{ marginTop: '0.125rem', flexShrink: 0 }}
                    checked={dbResetDeleteSetupData}
                    onChange={(e) => setDbResetDeleteSetupData(e.target.checked)}
                  />
                  <span>
                    <strong>Also delete setup data</strong> — removes your admin account, site name, admin path, and all settings. You will be taken to the setup wizard to start completely from scratch.
                  </span>
                </label>
                {dbResetError && <div className="alert alert-danger" style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>{dbResetError}</div>}
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    className="btn btn-danger"
                    disabled={dbResetting}
                    onClick={handleDbReset}
                  >
                    {dbResetting ? 'Resetting…' : 'Reset Database'}
                  </button>
                  <button
                    className="btn btn-secondary"
                    disabled={dbResetting}
                    onClick={() => { setShowDbResetConfirm(false); setDbResetError(''); setDbResetDeleteSetupData(false) }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {dbResetDone && (
              <div className="alert alert-info" style={{ marginBottom: '1.5rem' }}>
                {dbResetWasHard
                  ? 'Database reset successfully. Redirecting to setup…'
                  : 'All content cleared. Your admin account and site settings have been kept.'}
              </div>
            )}

            {/* Reset Everything deletes Vercel env vars - irrelevant in local mode. */}
            {!localMode && (
            <>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '0.25rem' }}>Reset Everything</h3>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
              Permanently removes all environment variables from your Vercel project and resets the site to factory settings.
            </p>
            {!showResetConfirm && !resetDone && (
              <button className="btn btn-danger" onClick={() => setShowResetConfirm(true)}>
                Reset Everything
              </button>
            )}
            {showResetConfirm && !resetDone && (
              <div className="card" style={{ borderColor: 'var(--color-destructive)' }}>
                <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', color: 'var(--color-destructive)' }}>Are you sure?</h3>
                <p style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>
                  This will <strong>permanently delete all environment variables</strong> from your Vercel project —
                  email credentials, media provider keys, integrations, and everything else.
                  A redeployment will be triggered automatically. You will need to reconfigure these settings afterwards.
                </p>
                {resetError && <div className="alert alert-danger" style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>{resetError}</div>}
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    className="btn btn-danger"
                    disabled={resetting}
                    onClick={async () => {
                      setResetting(true)
                      setResetError('')
                      try {
                        const res = await fetch('/api/admin/env', { method: 'DELETE' })
                        const d = (await res.json()) as { ok?: boolean; error?: string; deleted?: number; failed?: Array<{ key: string; error: string }>; redeployTriggered?: boolean }
                        if (!res.ok) throw new Error(d.error ?? 'Reset failed')
                        // A redeploy was triggered — hard reload so the proxy picks up the
                        // pendingRedeployId sentinel and shows the redeploying screen immediately.
                        if (d.redeployTriggered) {
                          window.location.reload()
                          return
                        }
                        setEnvStatus({})
                        setShowResetConfirm(false)
                        setResetDeletedCount(d.deleted ?? 0)
                        if (d.failed && d.failed.length > 0) {
                          setResetPartialError(`${d.failed.length} variable(s) could not be deleted: ${d.failed.map((f) => `${f.key} (${f.error})`).join(', ')}`)
                        }
                        setResetDone(true)
                      } catch (err: unknown) {
                        setResetError(err instanceof Error ? err.message : 'Reset failed')
                      } finally {
                        setResetting(false)
                      }
                    }}
                  >
                    {resetting ? 'Resetting…' : 'Reset'}
                  </button>
                  <button className="btn btn-secondary" disabled={resetting} onClick={() => { setShowResetConfirm(false); setResetError('') }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {resetDone && (
              <div className="alert alert-info">
                {resetDeletedCount > 0
                  ? `${resetDeletedCount} environment variable${resetDeletedCount === 1 ? '' : 's'} removed.`
                  : 'No removable environment variables were found (they may have already been cleared).'
                }{' '}
                A redeployment has been triggered — your site will restart with factory settings in a few minutes.
                {resetPartialError && (
                  <div style={{ marginTop: '0.5rem', color: 'var(--color-warning)', fontSize: '0.875rem' }}>
                    Warning: {resetPartialError}
                  </div>
                )}
              </div>
            )}
            </>
            )}
          </div>
        </div>
      )}

      {tab === 'access' && (
        <div>
          <div className="field">
            <label>Admin path</label>
            <input value={config.adminPath ?? ''} onChange={(e) => set('adminPath', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} />
            <span className="field-hint">Changing this takes effect on next deploy (Edge Config update triggered automatically).</span>
          </div>
          <label style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={config.publicRegistration ?? true} onChange={(e) => set('publicRegistration', e.target.checked)} />
            Allow public registration
          </label>
          <div className="field">
            <label>Trust this browser (days)</label>
            <input type="number" min={1} max={365} value={config.trustDeviceDays ?? 28} onChange={(e) => set('trustDeviceDays', parseInt(e.target.value))} />
          </div>
        </div>
      )}

      {tab === 'email' && (
        <div>
          <div className="field"><label>From name</label><input value={config.emailFromName ?? ''} onChange={(e) => set('emailFromName', e.target.value)} /></div>
          <div className="field"><label>From address</label><input type="email" value={config.emailFromAddress ?? ''} onChange={(e) => set('emailFromAddress', e.target.value)} /></div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '1.5rem 0' }} />
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Email provider credentials</div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: '0 0 0.75rem' }}>
              Stored in your Vercel project environment variables — never in the database.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <button
                className={emailMode === 'brevo' ? 'btn btn-primary' : 'btn btn-secondary'}
                style={{ fontSize: '0.875rem' }}
                onClick={() => setEmailMode('brevo')}
              >Brevo</button>
              <button
                className={emailMode === 'smtp' ? 'btn btn-primary' : 'btn btn-secondary'}
                style={{ fontSize: '0.875rem' }}
                onClick={() => setEmailMode('smtp')}
              >SMTP</button>
            </div>
          </div>
          {/* eslint-disable-next-line react-hooks/static-components -- EnvSectionCard is a render helper defined in this file; extracting it would require threading ~20 state values as props */}
          <EnvSectionCard section={emailMode === 'brevo' ? EMAIL_BREVO_SECTION : EMAIL_SMTP_SECTION} />
        </div>
      )}

      {tab === 'status' && (
        <div>
          <div className="field">
            <label>Site status</label>
            <select value={config.status ?? 'comingSoon'} onChange={(e) => set('status', e.target.value)}>
              <option value="live">Live</option>
              <option value="comingSoon">Coming soon</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>
          <div style={{ background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '1rem', marginBottom: '1.25rem' }}>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.875rem', color: 'var(--color-fg)', fontWeight: 500 }}>Status page layouts</p>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.8125rem', color: 'var(--color-muted)' }}>Customise the coming soon and maintenance screens in Layouts.</p>
            <a href={`/${config.adminPath ?? ''}/layouts?type=statusPage`} style={{ fontSize: 'var(--text-sm)', color: 'var(--color-primary)' }}>Manage status page layouts →</a>
          </div>
          <label style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={config.hideFromCrawlers ?? true} onChange={(e) => set('hideFromCrawlers', e.target.checked)} />
            Hide from search engines (noindex)
          </label>
        </div>
      )}

      {tab === 'gdpr' && (() => {
        const consent = config.consentBannerConfig ?? null
        const cats: ConsentCategory[] = consent?.categories ?? DEFAULT_CONSENT_BANNER_CONFIG.categories

        function updateCategory(index: number, updates: Partial<ConsentCategory>) {
          const next = cats.map((c, i) => i === index ? { ...c, ...updates } : c)
          setConsent({ categories: next })
        }

        function addCategory() {
          const next = [...cats, { key: `category_${cats.length}`, label: 'New category', description: '', required: false, defaultOn: false }]
          setConsent({ categories: next })
        }

        function removeCategory(index: number) {
          if (cats[index]?.key === 'necessary') return
          setConsent({ categories: cats.filter((_, i) => i !== index) })
        }

        const existingKeys = new Set(cats.map((c) => c.key))
        const availableSuggestions = gdprSuggestions.filter((k) => !existingKeys.has(k))

        return (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div className="field" style={{ margin: 0 }}>
                <label>Privacy policy page</label>
                <select value={config.privacyPolicyPageId ?? ''} onChange={(e) => set('privacyPolicyPageId', e.target.value || null as unknown as string)}>
                  <option value="">— Not set —</option>
                  {pages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Terms of service page</label>
                <select value={config.termsPageId ?? ''} onChange={(e) => set('termsPageId', e.target.value || null as unknown as string)}>
                  <option value="">— Not set —</option>
                  {pages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: '1.25rem' }}>
              <a href={`/${config.adminPath ?? ''}/config/privacy-generator`} className="btn btn-secondary btn-sm">
                {config.privacyPolicyPageId ? 'Generate a new privacy policy' : 'Generate a privacy policy'}
              </a>
              {config.privacyPolicyPageId && (
                <p className="field-hint" style={{ marginTop: '0.5rem' }}>
                  A privacy policy is already linked. Generating a new one will create a separate draft page.
                </p>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div className="field" style={{ margin: 0 }}>
                <label>Purge expired sessions after (days)</label>
                <input type="number" min={1} max={365} value={config.sessionPurgeAfterDays ?? 30} onChange={(e) => set('sessionPurgeAfterDays', parseInt(e.target.value))} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Purge unused recovery requests after (days)</label>
                <input type="number" min={1} max={30} value={config.recoveryPurgeAfterDays ?? 7} onChange={(e) => set('recoveryPurgeAfterDays', parseInt(e.target.value))} />
              </div>
            </div>

            {/* ----------------------------------------------------------------
                Cookie Consent Banner
            ---------------------------------------------------------------- */}
            <hr style={{ margin: '1.5rem 0', border: 'none', borderTop: '1px solid var(--color-border)' }} />
            <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: 'var(--color-text)' }}>Cookie consent banner</h3>

            <label style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', cursor: 'pointer', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={consent?.enabled ?? false}
                onChange={(e) => {
                  if (!consent) {
                    set('consentBannerConfig', { ...DEFAULT_CONSENT_BANNER_CONFIG, enabled: e.target.checked })
                  } else {
                    setConsent({ enabled: e.target.checked })
                  }
                }}
              />
              Enable cookie consent banner
            </label>

            {consent && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Banner style</label>
                    <select value={consent.style ?? 'bottom-bar'} onChange={(e) => setConsent({ style: e.target.value as 'bottom-bar' | 'modal' })}>
                      <option value="bottom-bar">Bottom bar</option>
                      <option value="modal">Modal (centred overlay)</option>
                    </select>
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Banner title</label>
                    <input type="text" value={consent.title ?? ''} onChange={(e) => setConsent({ title: e.target.value })} placeholder="Cookie preferences" />
                  </div>
                </div>

                <div className="field">
                  <label>Banner body text</label>
                  <textarea rows={3} value={consent.body ?? ''} onChange={(e) => setConsent({ body: e.target.value })} placeholder="Use {privacyPolicy} to insert a link to your privacy policy page." style={{ width: '100%', resize: 'vertical' }} />
                  <span className="field-hint">Use <code>{'{privacyPolicy}'}</code> to insert a link to your configured privacy policy page.</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Accept all label</label>
                    <input type="text" value={consent.acceptAllLabel ?? ''} onChange={(e) => setConsent({ acceptAllLabel: e.target.value })} placeholder="Accept all" />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Reject all label</label>
                    <input type="text" value={consent.rejectAllLabel ?? ''} onChange={(e) => setConsent({ rejectAllLabel: e.target.value })} placeholder="Reject all" />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Manage label</label>
                    <input type="text" value={consent.manageLabel ?? ''} onChange={(e) => setConsent({ manageLabel: e.target.value })} placeholder="Manage preferences" />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Dismiss button label</label>
                    <input type="text" value={consent.dismissLabel ?? ''} onChange={(e) => setConsent({ dismissLabel: e.target.value })} placeholder="Got it" />
                    <span className="field-hint">Shown only when no optional categories are configured.</span>
                  </div>
                </div>

                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontWeight: 500, fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--color-text)' }}>
                    Cookie categories
                  </label>
                  <p style={{ margin: '0 0 0.75rem', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                    &ldquo;Necessary&rdquo; is pinned and cannot be removed. Adding or removing categories, or changing their defaults, will re-prompt existing visitors.
                  </p>

                  <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden', marginBottom: '0.75rem' }}>
                    {cats.map((cat, i) => (
                      <div key={cat.key} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto auto', gap: '0.5rem', alignItems: 'start', padding: '0.75rem', borderBottom: i < cats.length - 1 ? '1px solid var(--color-border)' : 'none', background: cat.required ? 'var(--color-bg-subtle)' : 'var(--color-surface)' }}>
                        <div>
                          <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: 2 }}>Key</label>
                          <input
                            type="text"
                            value={cat.key}
                            disabled={cat.required}
                            onChange={(e) => updateCategory(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })}
                            style={{ width: '100%', fontSize: '0.8125rem' }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: 2 }}>Label</label>
                          <input type="text" value={cat.label} onChange={(e) => updateCategory(i, { label: e.target.value })} style={{ width: '100%', fontSize: '0.8125rem' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: 2 }}>Description</label>
                          <input type="text" value={cat.description} onChange={(e) => updateCategory(i, { description: e.target.value })} style={{ width: '100%', fontSize: '0.8125rem' }} />
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>On by default</label>
                          <input type="checkbox" checked={cat.required ? true : cat.defaultOn} disabled={cat.required} onChange={(e) => updateCategory(i, { defaultOn: e.target.checked })} />
                        </div>
                        <div style={{ paddingTop: '1.25rem' }}>
                          {cat.required ? (
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Required</span>
                          ) : (
                            <button type="button" onClick={() => removeCategory(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-destructive)', fontSize: '0.8125rem', padding: '0.25rem 0.5rem' }}>Remove</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button type="button" onClick={addCategory} style={{ fontSize: '0.8125rem', padding: '0.375rem 0.75rem', marginBottom: availableSuggestions.length > 0 ? '0.5rem' : 0 }}>
                    + Add category
                  </button>

                  {availableSuggestions.length > 0 && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginRight: '0.5rem' }}>Suggested by active modules:</span>
                      {availableSuggestions.map((key) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setConsent({ categories: [...cats, { key, label: key.charAt(0).toUpperCase() + key.slice(1), description: '', required: false, defaultOn: false }] })}
                          style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', marginRight: '0.375rem', marginBottom: '0.375rem', borderRadius: 9999, background: 'var(--color-primary-subtle)', border: '1px solid var(--color-primary-border)', color: 'var(--color-primary)', cursor: 'pointer' }}
                        >
                          + {key}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Re-prompt after (days)</label>
                    <input type="number" min={1} max={3650} value={consent.reConsentDays ?? 365} onChange={(e) => setConsent({ reConsentDays: parseInt(e.target.value) || 365 })} />
                    <span className="field-hint">Visitors who consented more than this many days ago will be shown the banner again.</span>
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Keep consent records for (days)</label>
                    <input type="number" min={0} value={consent.consentLogRetentionDays ?? ''} onChange={(e) => setConsent({ consentLogRetentionDays: e.target.value ? parseInt(e.target.value) : null })} placeholder="Blank = keep indefinitely" />
                    <span className="field-hint">Leave blank to keep records indefinitely (recommended for audit purposes).</span>
                  </div>
                </div>

                {(consent.categoriesVersion ?? 0) > 0 && (
                  <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '1.25rem' }}>
                    Categories version: <strong>{consent.categoriesVersion}</strong> &mdash; visitors will be re-prompted when this number increases.
                  </p>
                )}
              </>
            )}
          </div>
        )
      })()}

      {tab === 'branding' && (
        <div className="alert alert-info">
          Logo and favicon upload requires a media provider to be configured first. Choose one and add its credentials in the Media tab.
        </div>
      )}

      {tab === 'media' && (() => {
        const selected = config.mediaProvider ?? null
        const isProxiedSel = selected ? PROVIDER_KIND[selected] === 'PROXIED' : false
        const selectedVars = selected ? PROVIDER_ENV_VARS[selected] : []
        const job = migrationJob
        const jobActive = job && (job.status === 'running' || job.status === 'pending')
        const jobFailed = job && job.status === 'failed'
        const straysExist = Object.entries(breakdown).some(([p, n]) => p !== selected && n > 0)

        return (
          <div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
              Choose where uploaded images are stored. Provider selection is saved to your site config; the credentials
              themselves live only in your Vercel environment variables.
            </p>

            {envError && <div className="alert alert-danger" style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>{envError}</div>}

            {/* Provider dropdown, grouped by kind */}
            <div className="field">
              <label>Media provider</label>
              <select
                value={selected ?? ''}
                disabled={mediaBusy || !!jobActive}
                onChange={(e) => { if (e.target.value) handleProviderSelect(e.target.value as MediaProviderType) }}
              >
                <option value="">— Select a provider —</option>
                <optgroup label="Object storage (served via your Worker)">
                  {PROXIED_PROVIDERS.map((p) => (
                    <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
                  ))}
                </optgroup>
                <optgroup label="Image CDN (served directly by the provider)">
                  {DIRECT_PROVIDERS.map((p) => (
                    <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
                  ))}
                </optgroup>
              </select>
              <span className="field-hint">
                Changing this only affects where new uploads land. Existing images stay put until you migrate them.
              </span>
            </div>

            {/* Migrate / switch dialog after a change with stray rows */}
            {pendingProvider && (
              <div className="card" style={{ marginBottom: '1rem', borderColor: 'var(--color-warning)' }}>
                <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>Existing media on other providers</h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', marginBottom: '0.75rem' }}>
                  Some images still live on a different provider. You can move them onto {PROVIDER_LABELS[pendingProvider]} now,
                  or switch for new uploads only and migrate later.
                </p>
                <ul style={{ fontSize: '0.875rem', margin: '0 0 0.75rem 1rem' }}>
                  {Object.entries(breakdown).filter(([p, n]) => p !== pendingProvider && n > 0).map(([p, n]) => (
                    <li key={p}>{PROVIDER_LABELS[p as MediaProviderType] ?? p}: {n} item{n === 1 ? '' : 's'}</li>
                  ))}
                </ul>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button className="btn btn-primary" style={{ fontSize: '0.875rem' }} disabled={mediaBusy} onClick={confirmMigrateNow}>Migrate now</button>
                  <button className="btn btn-secondary" style={{ fontSize: '0.875rem' }} disabled={mediaBusy} onClick={() => setPendingProvider(null)}>Switch without migrating</button>
                </div>
              </div>
            )}

            {/* Env var checklist for the selected provider */}
            {selected && (
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div>
                    <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem' }}>{PROVIDER_LABELS[selected]} credentials</h3>
                    <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: 0 }}>
                      Stored in your Vercel project environment variables — never in the database.
                    </p>
                  </div>
                  <StatusBadge set={envKeysForProvider(selected).every((k) => envStatus[k])} />
                </div>
                {localMode && (
                  <div className="alert alert-info" style={{ fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
                    Managed via <code>.env.local</code> in local-development mode. Edit the file and restart the dev server to change these.
                  </div>
                )}
                {selectedVars.map((f) => (
                  <div className="field" key={f.key}>
                    <label style={{ fontSize: '0.875rem', display: 'flex', justifyContent: 'space-between' }}>
                      <code>{f.key}</code>
                      {envStatus[f.key] && <StatusBadge set />}
                    </label>
                    <input
                      type={f.type ?? 'text'}
                      autoComplete="off"
                      value={envFields[f.key] ?? ''}
                      onChange={(e) => setEnvField(f.key, e.target.value)}
                      placeholder={localMode ? (envStatus[f.key] ? 'Set in .env.local' : 'Not set') : (envStatus[f.key] ? 'Enter new value to change' : (f.placeholder ?? ''))}
                      disabled={localMode}
                      style={{ fontSize: '0.875rem' }}
                    />
                    {f.hint && <span className="field-hint">{f.hint}</span>}
                  </div>
                ))}
                {isProxiedSel && (
                  <>
                    <div className="field">
                      <label style={{ fontSize: '0.875rem', display: 'flex', justifyContent: 'space-between' }}>
                        <code>{CLOUDFLARE_WORKER_VAR.key}</code>
                        {envStatus[CLOUDFLARE_WORKER_VAR.key] && <StatusBadge set />}
                      </label>
                      <input
                        type="text"
                        autoComplete="off"
                        value={envFields[CLOUDFLARE_WORKER_VAR.key] ?? ''}
                        onChange={(e) => setEnvField(CLOUDFLARE_WORKER_VAR.key, e.target.value)}
                        placeholder={localMode ? (envStatus[CLOUDFLARE_WORKER_VAR.key] ? 'Set in .env.local' : 'Not set') : (envStatus[CLOUDFLARE_WORKER_VAR.key] ? 'Enter new value to change' : CLOUDFLARE_WORKER_VAR.placeholder)}
                        disabled={localMode}
                        style={{ fontSize: '0.875rem' }}
                      />
                      <span className="field-hint">{CLOUDFLARE_WORKER_VAR.hint}</span>
                    </div>
                    <div className="alert alert-info" style={{ fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
                      Also configure these same values as secrets on your Cloudflare Worker — see the{' '}
                      <a href="https://github.com/your-org/cactus/wiki/Self-hosting-and-operations" target="_blank" rel="noreferrer">self-hosting docs</a>.
                    </div>
                  </>
                )}
                {!localMode && (
                  <>
                    <button
                      className="btn btn-primary"
                      style={{ fontSize: '0.875rem' }}
                      disabled={savingEnvId === `media-${selected}` || !envKeysForProvider(selected).some((k) => envFields[k]?.trim())}
                      onClick={() => handleSaveEnv(`media-${selected}`, envKeysForProvider(selected))}
                    >
                      {savingEnvId === `media-${selected}` ? 'Saving…' : savedEnvId === `media-${selected}` ? '✓ Saved' : 'Save credentials'}
                    </button>
                    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginLeft: '1rem' }}>{savedEnvId === `media-${selected}` ? 'Redeploying…' : 'Takes effect on next deployment'}</span>
                  </>
                )}
              </div>
            )}

            {/* Per-provider breakdown */}
            <div className="card" style={{ marginBottom: '1rem' }}>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>Where your media lives</h3>
              {Object.keys(breakdown).length === 0 ? (
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: 0 }}>No media uploaded yet.</p>
              ) : (
                <ul style={{ fontSize: '0.875rem', margin: '0 0 0.5rem 1rem' }}>
                  {Object.entries(breakdown).map(([p, n]) => (
                    <li key={p}>
                      {PROVIDER_LABELS[p as MediaProviderType] ?? p}: {n} item{n === 1 ? '' : 's'}
                      {p === selected && <span style={{ color: 'var(--color-primary)' }}> (active)</span>}
                    </li>
                  ))}
                </ul>
              )}
              {selected && straysExist && !jobActive && (
                <button className="btn btn-secondary" style={{ fontSize: '0.875rem' }} disabled={mediaBusy} onClick={confirmMigrateNow}>
                  Migrate everything to {PROVIDER_LABELS[selected]}
                </button>
              )}
            </div>

            {/* Live migration progress */}
            {jobActive && job && (
              <div className="card" style={{ marginBottom: '1rem' }}>
                <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>
                  Migrating to {PROVIDER_LABELS[job.toProvider]}…
                </h3>
                <p style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                  {job.migratedItems} of {job.totalItems} migrated{migrationRunning ? '' : ' (paused)'}
                </p>
                <div style={{ height: 8, background: 'var(--color-border)', borderRadius: 4, overflow: 'hidden', marginBottom: '0.75rem' }}>
                  <div style={{ height: '100%', width: `${job.totalItems ? Math.round((job.migratedItems / job.totalItems) * 100) : 0}%`, background: 'var(--color-primary)' }} />
                </div>
                {job.failedItemIds.length > 0 && (
                  <details style={{ fontSize: '0.8125rem', marginBottom: '0.5rem' }}>
                    <summary>{job.failedItemIds.length} failed item{job.failedItemIds.length === 1 ? '' : 's'}</summary>
                    <ul style={{ margin: '0.5rem 0 0 1rem' }}>
                      {job.failedItemIds.map((f) => <li key={f.id}><code>{f.id}</code>: {f.error}</li>)}
                    </ul>
                  </details>
                )}
                <button className="btn btn-secondary" style={{ fontSize: '0.875rem' }} onClick={cancelMigration}>Cancel</button>
              </div>
            )}

            {/* Completed-with-failures retry */}
            {jobFailed && job && (
              <div className="card" style={{ marginBottom: '1rem', borderColor: 'var(--color-destructive)' }}>
                <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>Migration finished with failures</h3>
                <p style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                  {job.migratedItems} of {job.totalItems} migrated, {job.failedItemIds.length} failed.
                </p>
                <details style={{ fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
                  <summary>Show failed items</summary>
                  <ul style={{ margin: '0.5rem 0 0 1rem' }}>
                    {job.failedItemIds.map((f) => <li key={f.id}><code>{f.id}</code>: {f.error}</li>)}
                  </ul>
                </details>
                <button className="btn btn-primary" style={{ fontSize: '0.875rem' }} disabled={mediaBusy} onClick={retryMigration}>Retry failed items</button>
              </div>
            )}
          </div>
        )
      })()}

      {tab === 'integrations' && (
        <div>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
            All credentials are stored directly in your Vercel project environment variables. Changes take effect on next deployment.
          </p>
          {/* eslint-disable-next-line react-hooks/static-components -- GitHubAppCard and EnvSectionCard are render helpers; extracting them would require threading ~20 state values as props */}
          <GitHubAppCard />
          {INTEGRATION_SECTIONS.map((section) => (
            <EnvSectionCard key={section.id} section={section} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function ConfigPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Loading…</div>}>
      <ConfigPageInner />
    </Suspense>
  )
}
