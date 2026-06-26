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

type SiteConfig = {
  siteName: string; tagline: string; description: string;
  timezone: string; locale: string; dateFormat: string; timeFormat: string;
  adminPath: string; status: string; hideFromCrawlers: boolean;
  publicRegistration: boolean; trustDeviceDays: number;
  emailFromName: string; emailFromAddress: string; emailProvider: string;
  mediaProvider: MediaProviderType | null;
  comingSoonPageId: string; maintenancePageId: string;
  privacyPolicyPageId: string; termsPageId: string;
  sessionPurgeAfterDays: number; recoveryPurgeAfterDays: number;
  mainMenuId: string | null;
  homepageId: string | null;
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
  keys: Array<{ key: string; label: string; type?: 'text' | 'password'; placeholder?: string; hint?: string }>
}

const EMAIL_BREVO_SECTION: EnvSection = {
  id: 'email-brevo',
  label: 'Brevo',
  description: 'Transactional email via Brevo API',
  keys: [
    { key: 'BREVO_API_KEY', label: 'BREVO_API_KEY', type: 'password', placeholder: 'xkeysib-…', hint: 'Create at brevo.com → Settings → API Keys' },
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
    id: 'github',
    label: 'GitHub API',
    description: 'Required for installing and updating modules and themes',
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
    description: 'Lets Cactus create a Postgres database automatically during setup',
    keys: [
      { key: 'NEON_API_KEY', label: 'NEON_API_KEY', type: 'password', placeholder: 'Neon API key' },
    ],
  },
]

function StatusBadge({ set }: { set: boolean }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '0.125rem 0.5rem',
      borderRadius: 9999,
      fontSize: '0.75rem',
      fontWeight: 600,
      background: set ? '#dcfce7' : '#f3f4f6',
      color: set ? '#15803d' : '#6b7280',
    }}>
      {set ? '● Set' : '○ Not set'}
    </span>
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
  const [savingEnvId, setSavingEnvId] = useState<string | null>(null)
  const [savedEnvId, setSavedEnvId] = useState<string | null>(null)
  const [envError, setEnvError] = useState('')
  const [emailMode, setEmailMode] = useState<'brevo' | 'smtp'>('brevo')

  // Reset Everything state
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetDone, setResetDone] = useState(false)
  const [resetDeletedCount, setResetDeletedCount] = useState(0)
  const [resetPartialError, setResetPartialError] = useState('')
  const [resetError, setResetError] = useState('')

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
      const d = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok) throw new Error(d.error ?? 'Save failed')

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

  function set(key: keyof SiteConfig, value: unknown) {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  // Drives the batch endpoint repeatedly until the job finishes or is cancelled,
  // refreshing progress each round. The admin must keep this screen open.
  const runMigrationLoop = useCallback(async () => {
    setMigrationRunning(true)
    try {
      // eslint-disable-next-line no-constant-condition
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
            <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: 0 }}>{section.description}</p>
          </div>
          <StatusBadge set={isEnvSectionSet(allKeys)} />
        </div>
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
              placeholder={envStatus[f.key] ? 'Enter new value to change' : (f.placeholder ?? '')}
              style={{ fontSize: '0.875rem' }}
            />
            {f.hint && <span className="field-hint">{f.hint}</span>}
          </div>
        ))}
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
          <span style={{ fontSize: '0.8125rem', color: '#6b7280' }}>Takes effect on next deployment</span>
        </div>
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
      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid #e5e7eb', marginBottom: '2rem', overflowX: 'auto' }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '0.625rem 1rem', border: 'none', background: 'none',
            borderBottom: t === tab ? '2px solid #16a34a' : '2px solid transparent',
            color: t === tab ? '#16a34a' : '#6b7280', fontWeight: t === tab ? 600 : 400,
            cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.9375rem', whiteSpace: 'nowrap',
          }}>
            {tabLabels[t]}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <div>
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

          <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '2rem 0 1.5rem' }} />
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem', color: '#dc2626' }}>Danger zone</h2>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>
              Permanently removes all environment variables from your Vercel project and resets the site to factory settings.
            </p>
            {!showResetConfirm && !resetDone && (
              <button className="btn btn-danger" onClick={() => setShowResetConfirm(true)}>
                Reset Everything
              </button>
            )}
            {showResetConfirm && !resetDone && (
              <div className="card" style={{ borderColor: '#dc2626' }}>
                <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', color: '#dc2626' }}>Are you sure?</h3>
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
                        const d = (await res.json()) as { ok?: boolean; error?: string; deleted?: number; failed?: Array<{ key: string; error: string }> }
                        if (!res.ok) throw new Error(d.error ?? 'Reset failed')
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
                  <div style={{ marginTop: '0.5rem', color: '#b45309', fontSize: '0.875rem' }}>
                    Warning: {resetPartialError}
                  </div>
                )}
              </div>
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

          <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '1.5rem 0' }} />
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Email provider credentials</div>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.75rem' }}>
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
          <div className="field">
            <label>Coming soon page</label>
            <select value={config.comingSoonPageId ?? ''} onChange={(e) => set('comingSoonPageId', e.target.value)}>
              <option value="">— Use default template —</option>
              {pages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Maintenance page</label>
            <select value={config.maintenancePageId ?? ''} onChange={(e) => set('maintenancePageId', e.target.value)}>
              <option value="">— Use default template —</option>
              {pages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          <label style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={config.hideFromCrawlers ?? true} onChange={(e) => set('hideFromCrawlers', e.target.checked)} />
            Hide from search engines (noindex)
          </label>
        </div>
      )}

      {tab === 'gdpr' && (
        <div>
          <div className="field">
            <label>Privacy policy page</label>
            <select value={config.privacyPolicyPageId ?? ''} onChange={(e) => set('privacyPolicyPageId', e.target.value)}>
              <option value="">— Not set —</option>
              {pages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Terms of service page</label>
            <select value={config.termsPageId ?? ''} onChange={(e) => set('termsPageId', e.target.value)}>
              <option value="">— Not set —</option>
              {pages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Purge expired sessions after (days)</label>
            <input type="number" min={1} max={365} value={config.sessionPurgeAfterDays ?? 30} onChange={(e) => set('sessionPurgeAfterDays', parseInt(e.target.value))} />
          </div>
          <div className="field">
            <label>Purge unused recovery requests after (days)</label>
            <input type="number" min={1} max={30} value={config.recoveryPurgeAfterDays ?? 7} onChange={(e) => set('recoveryPurgeAfterDays', parseInt(e.target.value))} />
          </div>
        </div>
      )}

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
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>
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
              <div className="card" style={{ marginBottom: '1rem', borderColor: '#f59e0b' }}>
                <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>Existing media on other providers</h3>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.75rem' }}>
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
                    <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: 0 }}>
                      Stored in your Vercel project environment variables — never in the database.
                    </p>
                  </div>
                  <StatusBadge set={envKeysForProvider(selected).every((k) => envStatus[k])} />
                </div>
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
                      placeholder={envStatus[f.key] ? 'Enter new value to change' : (f.placeholder ?? '')}
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
                        placeholder={envStatus[CLOUDFLARE_WORKER_VAR.key] ? 'Enter new value to change' : CLOUDFLARE_WORKER_VAR.placeholder}
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
                <button
                  className="btn btn-primary"
                  style={{ fontSize: '0.875rem' }}
                  disabled={savingEnvId === `media-${selected}` || !envKeysForProvider(selected).some((k) => envFields[k]?.trim())}
                  onClick={() => handleSaveEnv(`media-${selected}`, envKeysForProvider(selected))}
                >
                  {savingEnvId === `media-${selected}` ? 'Saving…' : savedEnvId === `media-${selected}` ? '✓ Saved' : 'Save credentials'}
                </button>
                <span style={{ fontSize: '0.8125rem', color: '#6b7280', marginLeft: '1rem' }}>Takes effect on next deployment</span>
              </div>
            )}

            {/* Per-provider breakdown */}
            <div className="card" style={{ marginBottom: '1rem' }}>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>Where your media lives</h3>
              {Object.keys(breakdown).length === 0 ? (
                <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: 0 }}>No media uploaded yet.</p>
              ) : (
                <ul style={{ fontSize: '0.875rem', margin: '0 0 0.5rem 1rem' }}>
                  {Object.entries(breakdown).map(([p, n]) => (
                    <li key={p}>
                      {PROVIDER_LABELS[p as MediaProviderType] ?? p}: {n} item{n === 1 ? '' : 's'}
                      {p === selected && <span style={{ color: '#16a34a' }}> (active)</span>}
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
                <div style={{ height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden', marginBottom: '0.75rem' }}>
                  <div style={{ height: '100%', width: `${job.totalItems ? Math.round((job.migratedItems / job.totalItems) * 100) : 0}%`, background: '#16a34a' }} />
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
              <div className="card" style={{ marginBottom: '1rem', borderColor: '#dc2626' }}>
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
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem' }}>
            All credentials are stored directly in your Vercel project environment variables. Changes take effect on next deployment.
          </p>
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
    <Suspense fallback={<div style={{ padding: '2rem', color: '#6b7280' }}>Loading…</div>}>
      <ConfigPageInner />
    </Suspense>
  )
}
