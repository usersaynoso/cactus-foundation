'use client'

import { useState, useEffect, useCallback, useRef, Fragment, type ReactNode } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import type { MediaProviderType } from '@prisma/client'
import { useUnsavedChanges } from '@/components/admin/useUnsavedChanges'
import { UnsavedChangesModal } from '@/components/admin/UnsavedChangesModal'
import { TabStrip } from '@/components/admin/TabStrip'
import { moduleSettingsTabComponents } from '@/lib/modules/settings-tabs'
import MembersGdprClient from './MembersGdprClient'
import MembersSettingsTab, { type MembersSettingsTabKey } from './MembersSettingsTab'
import RolesClient from './RolesClient'
import EmailTemplatesClient from './EmailTemplatesClient'
import {
  PROVIDER_KIND,
  PROVIDER_LABELS,
  PROVIDER_ENV_VARS,
  PROVIDER_SETUP_LINKS,
  CLOUDFLARE_WORKER_VAR,
  CLOUDFLARE_DASH_URL,
  CLOUDFLARE_API_TOKENS_URL,
  CLOUDFLARE_TOKEN_PERMISSIONS,
  WORKER_SECRET_KEYS,
  ALL_PROVIDERS,
  envKeysForProvider,
} from '@/lib/media/providers'
import type { ConsentBannerConfig, ConsentCategory } from '@/lib/consent/types'
import { DEFAULT_CONSENT_BANNER_CONFIG } from '@/lib/consent/types'

type SiteConfig = {
  siteName: string; tagline: string; description: string;
  timezone: string; locale: string; dateFormat: string; timeFormat: string;
  adminPath: string; status: string; hideFromCrawlers: boolean;
  trustDeviceDays: number;
  emailFromName: string; emailFromAddress: string; emailProvider: string;
  mediaProvider: MediaProviderType | null;
  logoMediaId: string | null; faviconMediaId: string | null;
  privacyPolicyPageId: string; termsPageId: string;
  sessionPurgeAfterDays: number; recoveryPurgeAfterDays: number;
  mainMenuId: string | null;
  homepageId: string | null;
  consentBannerConfig: ConsentBannerConfig | null;
}

type InfoPage = { id: string; title: string }
type MenuOption = { id: string; name: string }

const TABS = ['general', 'branding', 'email', 'media', 'status', 'gdpr', 'integrations'] as const
type Tab = typeof TABS[number]

// Env var sections: each section has a label, description, and its managed keys.
type EnvSection = {
  id: string
  label: string
  description: string
  keys: Array<{ key: string; label: string; type?: 'text' | 'password'; placeholder?: string; hint?: React.ReactNode }>
  columns?: number
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
  columns: 2,
  keys: [
    { key: 'SMTP_HOST', label: 'SMTP Host', placeholder: 'smtp.example.com' },
    { key: 'SMTP_PORT', label: 'SMTP Port', placeholder: '587' },
    { key: 'SMTP_USER', label: 'SMTP Username', placeholder: 'you@example.com' },
    { key: 'SMTP_PASS', label: 'SMTP Password', type: 'password', placeholder: '••••••••' },
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

type ModuleUpdateInfo = {
  id: string
  name: string
  currentVersion: string
  latestTag: string
}

type UpdatesApiResponse = {
  status: CoreUpdateStatus
  coreUpdateChannel: 'public' | 'beta'
  modulesWithUpdates?: ModuleUpdateInfo[]
}

function formatModuleUpdateName(name: string): string {
  return name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

const UPDATE_CHECK_CACHE_KEY = 'cactus-core-update-check'
const UPDATE_CHECK_THROTTLE_MS = 10 * 60 * 1000

type UpdateCheckCache = { at: number; data: UpdatesApiResponse }

function UpdatesPanel() {
  const [status, setStatus] = useState<CoreUpdateStatus | null>(null)
  const [channel, setChannel] = useState<'public' | 'beta'>('public')
  const [channelSaving, setChannelSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState('')
  const [modulesWithUpdates, setModulesWithUpdates] = useState<ModuleUpdateInfo[]>([])
  const [updateModulesToo, setUpdateModulesToo] = useState(true)

  async function runCheck(bust = false) {
    setChecking(true)
    try {
      const res = await fetch(`/api/admin/updates${bust ? '?bust=true' : ''}`)
      if (!res.ok) return
      const d = (await res.json()) as UpdatesApiResponse
      setStatus(d.status)
      setChannel(d.coreUpdateChannel ?? 'public')
      setModulesWithUpdates(d.modulesWithUpdates ?? [])
      sessionStorage.setItem(UPDATE_CHECK_CACHE_KEY, JSON.stringify({ at: Date.now(), data: d } satisfies UpdateCheckCache))
    } catch {
      // ignore
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    const cached = sessionStorage.getItem(UPDATE_CHECK_CACHE_KEY)
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as UpdateCheckCache
        if (Date.now() - parsed.at < UPDATE_CHECK_THROTTLE_MS) {
          // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating from sessionStorage cache read; must happen on mount
          setStatus(parsed.data.status)
          setChannel(parsed.data.coreUpdateChannel ?? 'public')
          setModulesWithUpdates(parsed.data.modulesWithUpdates ?? [])
          return
        }
      } catch {
        // ignore malformed cache
      }
    }
    runCheck()
  }, [])

  async function handleChannelChange(newChannel: 'public' | 'beta') {
    if (newChannel === channel || channelSaving) return
    setChannelSaving(true)
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coreUpdateChannel: newChannel }),
      })
      if (!res.ok) return
      setChannel(newChannel)
      await runCheck(true)
    } finally {
      setChannelSaving(false)
    }
  }

  async function handleUpdate() {
    setUpdating(true)
    setUpdateError('')
    try {
      const res = await fetch('/api/admin/updates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updateModules: modulesWithUpdates.length > 0 && updateModulesToo }),
      })
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

  if (checking && !status) {
    return (
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem' }}>Core updates</h3>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: 0 }}>Checking for updates&hellip;</p>
      </div>
    )
  }

  if (!status) return null

  const isLocal = 'localMode' in status

  let badge: React.ReactNode
  let subtitle: string
  let body: React.ReactNode
  let confirmModal: React.ReactNode = null

  if (isLocal) {
    badge = <span className="badge badge-default">Local dev</span>
    subtitle = `Running v${status.currentVersion}`
    body = (
      <div className="alert alert-info" style={{ fontSize: 'var(--text-sm)' }}>
        You&rsquo;re running in local-development mode. Core updates ship via git and a Vercel redeploy, so
        they&rsquo;re managed outside the admin here - pull the latest Cactus Foundation release and redeploy
        to update.
      </div>
    )
  } else if (!status.configured) {
    badge = <span className="badge badge-default">Not connected</span>
    subtitle = 'Cactus Foundation core version'
    body = (
      <div className="alert alert-info" style={{ fontSize: 'var(--text-sm)' }}>
        Automatic updates require GitHub to be configured. Connect a GitHub App in{' '}
        <a href="?tab=integrations" style={{ color: 'var(--color-primary)' }}>Settings → Integrations</a>.
      </div>
    )
  } else if ('error' in status) {
    badge = <span className="badge badge-warning">Check failed</span>
    subtitle = 'Cactus Foundation core version'
    body = (
      <div className="alert alert-warning" style={{ fontSize: 'var(--text-sm)' }}>
        Couldn&rsquo;t check for updates right now. Please try again later.
      </div>
    )
  } else if (!status.updateAvailable) {
    badge = <span className="badge badge-success">Up to date</span>
    subtitle = `Running v${status.currentVersion}`
    body = (
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: 0 }}>
        You&rsquo;re on the latest release.
      </p>
    )
  } else {
    badge = <span className="badge badge-primary">Update available</span>
    subtitle = `Running v${status.currentVersion}`
    body = (
      <div>
        <p style={{ fontSize: 'var(--text-sm)', margin: '0 0 0.75rem' }}>
          v{status.currentVersion} &rarr; <strong>v{status.latestVersion}</strong>{' '}
          <a
            href={status.latestUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginLeft: '0.25rem' }}
          >
            View on GitHub →
          </a>
        </p>

        {status.releaseNotesHtml && (
          <div style={{ marginBottom: '0.75rem' }}>
            <button
              type="button"
              onClick={() => setShowNotes((s) => !s)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 'var(--text-sm)', color: 'var(--color-primary)', fontFamily: 'inherit' }}
            >
              {showNotes ? 'Hide' : "What's new"} {showNotes ? '▲' : '▼'}
            </button>
            {showNotes && (
              <div
                style={{ marginTop: '0.625rem', border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.75rem 1rem', maxHeight: '16rem', overflowY: 'auto', fontSize: 'var(--text-sm)', lineHeight: 1.6 }}
                dangerouslySetInnerHTML={{ __html: status.releaseNotesHtml }}
              />
            )}
          </div>
        )}

        <button
          className="btn btn-primary"
          style={{ fontSize: 'var(--text-sm)' }}
          onClick={() => { setUpdateError(''); setShowConfirm(true) }}
        >
          Update now
        </button>
      </div>
    )

    if (showConfirm) {
      confirmModal = (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={(e) => { if (e.target === e.currentTarget && !updating) setShowConfirm(false) }}
        >
          <div className="card" style={{ maxWidth: '480px', width: '100%', margin: '1rem' }}>
            <h2 className="card-title">Update to v{status.latestVersion}</h2>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: modulesWithUpdates.length > 0 ? '1rem' : '1.5rem' }}>
              This copies the updated core files from the upstream Cactus Foundation repository into your
              GitHub repo and triggers a redeploy. Your content and database are not affected.
            </p>
            {modulesWithUpdates.length > 0 && (
              <label style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start', marginBottom: '1.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={updateModulesToo}
                  disabled={updating}
                  onChange={(e) => setUpdateModulesToo(e.target.checked)}
                  style={{ marginTop: '0.2rem' }}
                />
                <span style={{ fontSize: 'var(--text-sm)' }}>
                  Also update {modulesWithUpdates.length === 1 ? 'the module' : `all ${modulesWithUpdates.length} modules`} with updates available
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '0.15rem' }}>
                    {modulesWithUpdates.map((m) => `${formatModuleUpdateName(m.name)} → v${m.latestTag.replace(/^v/i, '')}`).join(', ')}
                  </div>
                </span>
              </label>
            )}
            {updateError && (
              <div className="alert alert-danger" style={{ fontSize: 'var(--text-sm)', marginBottom: '1rem' }}>
                {updateError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                disabled={updating}
                onClick={() => { setShowConfirm(false); setUpdateError('') }}
              >
                Cancel
              </button>
              <button className="btn btn-primary" disabled={updating} onClick={handleUpdate}>
                {updating ? 'Updating…' : 'Confirm update'}
              </button>
            </div>
          </div>
        </div>
      )
    }
  }

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', gap: '0.75rem' }}>
        <div>
          <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem' }}>Core updates</h3>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: 0 }}>{subtitle}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          {badge}
          {!isLocal && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: 'var(--text-sm)' }}
              disabled={checking}
              onClick={() => runCheck(true)}
            >
              {checking ? 'Checking…' : 'Refresh'}
            </button>
          )}
        </div>
      </div>

      {!isLocal && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Update channel:</span>
          <button
            type="button"
            className={channel === 'public' ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ fontSize: 'var(--text-sm)' }}
            disabled={channelSaving}
            onClick={() => handleChannelChange('public')}
          >
            Public
          </button>
          <button
            type="button"
            className={channel === 'beta' ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ fontSize: 'var(--text-sm)' }}
            disabled={channelSaving}
            onClick={() => handleChannelChange('beta')}
          >
            Beta
          </button>
          {channelSaving && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Saving&hellip;</span>
          )}
        </div>
      )}

      {body}
      {confirmModal}
    </div>
  )
}

// Fingerprint of the config the top "Save changes" button persists. Excludes
// mediaProvider, which is saved immediately on its own and so never counts as an
// unsaved change.
function configFingerprint(c: Partial<SiteConfig>): string {
  const { mediaProvider: _mediaProvider, ...rest } = c
  return JSON.stringify(rest)
}

// A single logo/favicon slot on the Branding tab: preview, upload/replace, and
// remove. Uploads go straight to the media library; the parent stores the
// returned media id on the config and persists it with the top "Save changes".
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

function BrandingImageField({
  label,
  hint,
  previewUrl,
  square = false,
  mediaId = null,
  allowOptimise = false,
  onUploaded,
  onRemove,
}: {
  label: string
  hint: string
  previewUrl: string | null
  square?: boolean
  mediaId?: string | null
  allowOptimise?: boolean
  onUploaded: (media: { id: string; url: string }) => void
  onRemove: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const [optimising, setOptimising] = useState(false)
  const [optimiseNote, setOptimiseNote] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleOptimise() {
    if (!mediaId) return
    setOptimising(true)
    setError('')
    setOptimiseNote('')
    try {
      const res = await fetch('/api/admin/media/optimise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Optimise failed')
      if (d.optimised) {
        onUploaded({ id: d.id, url: d.url })
        const saved = Math.round((1 - d.after / d.before) * 100)
        setOptimiseNote(`Optimised: ${formatBytes(d.before)} → ${formatBytes(d.after)} (${saved}% smaller).`)
      } else {
        setOptimiseNote(`Already about as small as it gets (${formatBytes(d.before)}) - left as-is.`)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Optimise failed')
    } finally {
      setOptimising(false)
    }
  }

  async function handleFile(file: File | null) {
    if (!file) return
    setUploading(true)
    setError('')
    setOptimiseNote('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('altText', label)
      const res = await fetch('/api/admin/media', { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Upload failed')
      onUploaded({ id: d.id, url: d.url })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="field" style={{ marginBottom: '1.5rem' }}>
      <label style={{ display: 'block', marginBottom: '0.5rem' }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- media URLs are user-supplied remote hosts, not statically optimisable
          <img
            src={previewUrl}
            alt={`${label} preview`}
            style={{
              height: 64,
              width: square ? 64 : 'auto',
              maxWidth: 240,
              objectFit: 'contain',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius)',
              padding: '0.35rem',
              background: 'var(--color-surface)',
            }}
          />
        ) : (
          <div
            style={{
              height: 64,
              width: square ? 64 : 120,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px dashed var(--color-border)',
              borderRadius: 'var(--radius)',
              color: 'var(--color-text-muted)',
              fontSize: 'var(--text-sm)',
            }}
          >
            None
          </div>
        )}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
          <button type="button" className="btn btn-secondary btn-sm" disabled={uploading || optimising} onClick={() => inputRef.current?.click()}>
            {uploading ? 'Uploading…' : previewUrl ? 'Replace' : 'Upload'}
          </button>
          {allowOptimise && previewUrl && mediaId && (
            <button type="button" className="btn btn-secondary btn-sm" disabled={uploading || optimising} onClick={handleOptimise}>
              {optimising ? 'Optimising…' : 'Optimise'}
            </button>
          )}
          {previewUrl && (
            <button type="button" className="btn btn-secondary btn-sm" disabled={uploading || optimising} onClick={onRemove}>
              Remove
            </button>
          )}
        </div>
      </div>
      <span className="field-hint">{hint}</span>
      {allowOptimise && (
        <span className="field-hint" style={{ display: 'block' }}>
          Resizes an oversized logo and compresses it with no loss of quality. Remember to press Save changes afterwards.
        </span>
      )}
      {optimiseNote && <span style={{ color: 'var(--color-success)', fontSize: 'var(--text-sm)', display: 'block', marginTop: '0.35rem' }}>{optimiseNote}</span>}
      {error && <span style={{ color: 'var(--color-destructive)', fontSize: 'var(--text-sm)', display: 'block', marginTop: '0.35rem' }}>{error}</span>}
    </div>
  )
}

type ModuleTab = { id: string; label: string }
type RolesData = { roles: Array<{ id: string; name: string; isProtected: boolean; permissionKeys: string[]; userCount: number }>; permissions: Array<{ key: string; description: string | null; module: string | null }>; activeModuleNames: string[] }

type ConfigPageInnerProps = {
  moduleTabs: ModuleTab[]
  canManageMembersSettings: boolean
  canManageRoles: boolean
  canManageEmailTemplates: boolean
  canViewMembersGdpr: boolean
  rolesData: RolesData | null
  roleExtensions: ReactNode
  membersGdprExtensions: ReactNode
}

function ConfigPageInner({ moduleTabs, canManageMembersSettings, canManageRoles, canManageEmailTemplates, canViewMembersGdpr, rolesData, roleExtensions, membersGdprExtensions }: ConfigPageInnerProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { dirtyRef, pendingHref, setPendingHref } = useUnsavedChanges()
  // Baseline for unsaved-change detection: set on load and after each save.
  const savedFingerprint = useRef<string | null>(null)
  const tabParam = searchParams.get('tab')
  const showUsersTab = canManageMembersSettings || canManageRoles || canManageEmailTemplates
  const initialTab = TABS.includes(tabParam as Tab) || moduleTabs.some((t) => t.id === tabParam) || (showUsersTab && tabParam === 'users') ? (tabParam as string) : 'general'
  const [tab, setTab] = useState<string>(initialTab)
  const [usersSubTab, setUsersSubTab] = useState<MembersSettingsTabKey | 'roles' | 'email-templates'>(
    canManageMembersSettings ? 'registration' : canManageRoles ? 'roles' : 'email-templates'
  )
  const [config, setConfig] = useState<Partial<SiteConfig>>({})
  // Branding tab: preview URLs resolved from the stored logo/favicon media ids.
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null)
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
  const [testEmailTo, setTestEmailTo] = useState('')
  const [testEmailSending, setTestEmailSending] = useState(false)
  const [testEmailSent, setTestEmailSent] = useState('')
  const [testEmailError, setTestEmailError] = useState('')

  // Refresh templates state
  const [refreshingTemplates, setRefreshingTemplates] = useState(false)
  const [templatesRefreshed, setTemplatesRefreshed] = useState(false)
  const [templatesRefreshError, setTemplatesRefreshError] = useState('')

  // Database backup state
  const [downloadingBackup, setDownloadingBackup] = useState(false)
  const [backupError, setBackupError] = useState('')

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

  const ghAutoInstallTriggered = useRef(false)

  useEffect(() => {
    const github = searchParams.get('github')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- delegating to async helper; all setState calls are after awaits
    if (github === 'installed' || github === 'connected') loadGhStatus()
    if (github === 'connected' && !loading && !ghAutoInstallTriggered.current) {
      ghAutoInstallTriggered.current = true
      const adminPath = config.adminPath ?? ''
      setGhBusy(true)
      void (async () => {
        try {
          const res = await fetch(`/${adminPath}/integrations/github/install`)
          if (!res.ok) { setGhError('Failed to get install URL'); setGhBusy(false); return }
          const { installUrl } = await res.json() as { installUrl: string }
          window.location.href = installUrl
        } catch {
          setGhError('Failed to get install URL')
          setGhBusy(false)
        }
      })()
    }
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
  }, [searchParams, loadGhStatus, config.adminPath, loading])

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

  // Cloudflare Worker auto-deploy state
  const [cfAuthMode, setCfAuthMode] = useState<'token' | 'global'>('token')
  const [cfToken, setCfToken] = useState('')
  const [cfGlobalKey, setCfGlobalKey] = useState('')
  const [cfEmail, setCfEmail] = useState('')
  const [cfAccountId, setCfAccountId] = useState('')
  const [cfDeploying, setCfDeploying] = useState(false)
  const [cfResult, setCfResult] = useState<{ ok: boolean; url?: string; message: string } | null>(null)

  const handleDeployWorker = useCallback(async (provider: MediaProviderType) => {
    setCfDeploying(true)
    setCfResult(null)
    try {
      // Send any freshly-typed provider values so the deploy works before the
      // credentials have been saved + redeployed into the server environment.
      const secrets: Record<string, string> = {}
      for (const k of WORKER_SECRET_KEYS[provider]) {
        const v = envFields[k]
        if (v && v.trim()) secrets[k] = v.trim()
      }
      const payload = {
        provider,
        authMode: cfAuthMode,
        apiToken: cfAuthMode === 'token' ? cfToken.trim() : undefined,
        globalKey: cfAuthMode === 'global' ? cfGlobalKey.trim() : undefined,
        email: cfAuthMode === 'global' ? cfEmail.trim() : undefined,
        accountId: cfAccountId.trim() || undefined,
        secrets,
      }
      const res = await fetch('/api/admin/media/deploy-worker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; url?: string; customDomain?: string | null; note?: string; rebased?: number | null; warning?: string; error?: string }
        | null
      if (!res.ok || !data?.ok) {
        setCfResult({ ok: false, message: data?.error ?? 'Worker deployment failed.' })
        return
      }
      // Success: the Worker URL is now saved server-side, so reflect it as set.
      setEnvStatus((s) => ({ ...s, [CLOUDFLARE_WORKER_VAR.key]: true }))
      // Drop the pasted credentials from component memory now they're stored.
      setCfToken('')
      setCfGlobalKey('')
      setCfEmail('')
      // Prefer a tidy media.<your-domain> address when Cactus managed to attach
      // it; otherwise report the workers.dev URL and why the pretty one was skipped.
      let message: string
      if (data.warning) {
        message = data.warning
      } else if (data.customDomain) {
        let host = data.customDomain
        try { host = new URL(data.customDomain).host } catch { /* show the raw value */ }
        message = `Worker deployed and your images will load from ${host}. Redeploy your site (Status tab) to switch over - the secure certificate can take a minute to go live.`
      } else {
        message = `Worker deployed at ${data.url ?? 'your Cloudflare account'}. Redeploy your site (Status tab) to start serving media through it.`
        if (data.note) message += ` A media address on your own domain wasn't set up: ${data.note}.`
      }
      if (data.rebased && data.rebased > 0) {
        message += ` ${data.rebased} existing image${data.rebased === 1 ? '' : 's'} moved across to the new address.`
      }
      setCfResult({ ok: true, url: data.customDomain ?? data.url, message })
    } catch {
      setCfResult({ ok: false, message: 'Could not reach the server. Please try again.' })
    } finally {
      setCfDeploying(false)
    }
  }, [cfAuthMode, cfToken, cfGlobalKey, cfEmail, cfAccountId, envFields])

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
      // logoUrl/faviconUrl are derived preview fields, not columns — keep them
      // out of the config state (and its dirty-fingerprint) and drive previews.
      const { logoUrl, faviconUrl, ...cfgRest } = cfg as Partial<SiteConfig> & { logoUrl?: string | null; faviconUrl?: string | null }
      setConfig(cfgRest)
      savedFingerprint.current = configFingerprint(cfgRest)
      setLogoPreview(logoUrl ?? null)
      setFaviconPreview(faviconUrl ?? null)
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

  // Flag unsaved changes whenever the form diverges from the last saved baseline.
  useEffect(() => {
    if (savedFingerprint.current === null) return
    dirtyRef.current = configFingerprint(config) !== savedFingerprint.current
  }, [config, dirtyRef])

  async function handleSave(): Promise<boolean> {
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
      savedFingerprint.current = configFingerprint(config)
      dirtyRef.current = false
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      return true
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed')
      return false
    } finally {
      setSaving(false)
    }
  }

  function leaveNow(href: string) {
    dirtyRef.current = false
    setPendingHref(null)
    router.push(href)
  }

  async function saveAndLeave() {
    const href = pendingHref
    const ok = await handleSave()
    if (ok && href) { setPendingHref(null); router.push(href) }
    else setPendingHref(null) // save failed - stay put so the error is visible
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

  async function handleSendTestEmail() {
    setTestEmailSending(true)
    setTestEmailError('')
    setTestEmailSent('')
    try {
      const res = await fetch('/api/admin/config/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testEmailTo.trim() ? { to: testEmailTo.trim() } : {}),
      })
      const d = (await res.json()) as { ok?: boolean; to?: string; error?: string }
      if (!res.ok) throw new Error(d.error ?? 'Failed to send test email')
      setTestEmailSent(d.to ?? testEmailTo.trim())
    } catch (err: unknown) {
      setTestEmailError(err instanceof Error ? err.message : 'Failed to send test email')
    } finally {
      setTestEmailSending(false)
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

  async function handleDownloadBackup() {
    setDownloadingBackup(true)
    setBackupError('')
    try {
      const res = await fetch('/api/admin/backup/database')
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(d?.error ?? 'Backup failed')
      }
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const filenameMatch = disposition.match(/filename="([^"]+)"/)
      const filename = filenameMatch?.[1] ?? `cactus-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`
      const url = URL.createObjectURL(blob)
      try {
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
      } finally {
        URL.revokeObjectURL(url)
      }
    } catch (err: unknown) {
      setBackupError(err instanceof Error ? err.message : 'Backup failed')
    } finally {
      setDownloadingBackup(false)
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
    // Persisted immediately by this call, so update state without flagging the
    // main form dirty.
    setConfig((prev) => ({ ...prev, mediaProvider: provider }))
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
    general: 'General', branding: 'Branding',
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
      <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
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
              {ghBusy
                ? <>App <strong>{gh.appSlug}</strong> created. Redirecting you to GitHub to install it…</>
                : <>App <strong>{gh.appSlug}</strong> created but not yet installed on a repository. Install it to grant access.</>}
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

    const fieldRows = section.keys.map((f) => (
      <div className="field" key={f.key} style={section.columns ? { margin: 0 } : undefined}>
        <label style={{ fontSize: '0.875rem', display: 'flex', justifyContent: 'space-between' }}>
          <span>
            {f.label}
            {f.label !== f.key && <code style={{ marginLeft: '0.375rem', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{f.key}</code>}
          </span>
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
    ))

    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
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
        {section.columns ? (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${section.columns}, 1fr)`, gap: '0.75rem', marginBottom: 'var(--form-gap)' }}>
            {fieldRows}
          </div>
        ) : fieldRows}
        {!localMode && (
          <>
            {envError && savingEnvId === null && savedEnvId === null && (
              <div className="alert alert-danger" style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>{envError}</div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: 'auto' }}>
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

      <UnsavedChangesModal
        pendingHref={pendingHref}
        saving={saving}
        message="You have unsaved changes. Would you like to save them before leaving?"
        onCancel={() => setPendingHref(null)}
        onDiscard={() => leaveNow(pendingHref!)}
        onSave={saveAndLeave}
      />

      {/* Tab bar */}
      <TabStrip
        style={{ marginBottom: '2rem' }}
        items={[
          ...TABS.map((t) => ({ key: t, label: tabLabels[t], active: t === tab, onClick: () => setTab(t) })),
          ...(showUsersTab ? [{ key: 'users', label: 'Users', active: tab === 'users', onClick: () => setTab('users') }] : []),
          ...moduleTabs.map((t) => ({ key: t.id, label: t.label, active: t.id === tab, onClick: () => setTab(t.id) })),
        ]}
      />

      {tab === 'general' && (
        <div>
          <UpdatesPanel />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: 'var(--form-gap)' }}>
            <div className="field" style={{ margin: 0 }}><label>Site name</label><input value={config.siteName ?? ''} onChange={(e) => set('siteName', e.target.value)} /></div>
            <div className="field" style={{ margin: 0 }}><label>Tagline</label><input value={config.tagline ?? ''} onChange={(e) => set('tagline', e.target.value)} /></div>
          </div>
          <div className="field"><label>Description</label><textarea value={config.description ?? ''} onChange={(e) => set('description', e.target.value)} rows={3} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: 'var(--form-gap)' }}>
            <div className="field" style={{ margin: 0 }}>
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
            <div className="field" style={{ margin: 0 }}>
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
          </div>
          <div className="field">
            <span className="field-hint">Header and footer are designed in <strong>Appearance</strong>. Layouts are managed under <strong>Layouts</strong>.</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: 'var(--form-gap)' }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Timezone</label>
              <select value={config.timezone ?? 'UTC'} onChange={(e) => set('timezone', e.target.value)}>
                {['UTC','Europe/London','Europe/Paris','Europe/Berlin','America/New_York','America/Chicago','America/Los_Angeles','Asia/Tokyo','Australia/Sydney'].map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}><label>Date format</label><input value={config.dateFormat ?? 'DD/MM/YYYY'} onChange={(e) => set('dateFormat', e.target.value)} /></div>
            <div className="field" style={{ margin: 0 }}><label>Time format</label><input value={config.timeFormat ?? 'HH:mm'} onChange={(e) => set('timeFormat', e.target.value)} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: 'var(--form-gap)' }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Admin path</label>
              <input value={config.adminPath ?? ''} onChange={(e) => set('adminPath', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} />
              <span className="field-hint">Changing this takes effect on next deploy (Edge Config update triggered automatically).</span>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Trust this browser (days)</label>
              <input type="number" min={1} max={365} value={config.trustDeviceDays ?? 28} onChange={(e) => set('trustDeviceDays', parseInt(e.target.value))} />
              <span className="field-hint">How long an admin who ticks &quot;trust this browser&quot; at login skips the email code.</span>
            </div>
          </div>

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
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>Backup</h2>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
              Download a full copy of your database - every page, user, layout, and setting - as a single SQL file. No storage provider needed, it downloads straight to your device.
            </p>
            {backupError && (
              <div className="alert alert-danger" style={{ marginBottom: '1rem', fontSize: '0.875rem' }}>{backupError}</div>
            )}
            <button
              className="btn btn-primary"
              disabled={downloadingBackup}
              onClick={handleDownloadBackup}
            >
              {downloadingBackup ? 'Preparing backup…' : 'Download Backup'}
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

      {tab === 'users' && showUsersTab && (
        <div>
          <TabStrip
            items={[
              ...(canManageMembersSettings ? [
                { key: 'registration', label: 'Registration', active: usersSubTab === 'registration', onClick: () => setUsersSubTab('registration') },
                { key: 'avatars', label: 'Avatars', active: usersSubTab === 'avatars', onClick: () => setUsersSubTab('avatars') },
                { key: 'usernames', label: 'Usernames', active: usersSubTab === 'usernames', onClick: () => setUsersSubTab('usernames') },
                { key: 'sections', label: 'Account sections', active: usersSubTab === 'sections', onClick: () => setUsersSubTab('sections') },
                { key: 'access', label: 'Access control', active: usersSubTab === 'access', onClick: () => setUsersSubTab('access') },
              ] : []),
              ...(canManageRoles ? [{ key: 'roles', label: 'Roles', active: usersSubTab === 'roles', onClick: () => setUsersSubTab('roles') }] : []),
              ...(canManageEmailTemplates ? [{ key: 'email-templates', label: 'Email templates', active: usersSubTab === 'email-templates', onClick: () => setUsersSubTab('email-templates') }] : []),
            ]}
          />

          {canManageMembersSettings && (usersSubTab === 'registration' || usersSubTab === 'avatars' || usersSubTab === 'usernames' || usersSubTab === 'sections' || usersSubTab === 'access') && (
            <MembersSettingsTab tab={usersSubTab} />
          )}

          {usersSubTab === 'roles' && canManageRoles && rolesData && (
            <>
              <p style={{ margin: '0 0 1.25rem', color: 'var(--color-text-muted)', fontSize: 'var(--text-base)' }}>
                Pick a role on the left, then choose what people with that role are allowed to do.
              </p>
              <RolesClient roles={rolesData.roles} permissions={rolesData.permissions} activeModuleNames={rolesData.activeModuleNames} />
              {roleExtensions}
            </>
          )}

          {usersSubTab === 'email-templates' && canManageEmailTemplates && <EmailTemplatesClient />}
        </div>
      )}

      {tab === 'email' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: 'var(--form-gap)' }}>
            <div className="field" style={{ margin: 0 }}><label>From name</label><input value={config.emailFromName ?? ''} onChange={(e) => set('emailFromName', e.target.value)} /></div>
            <div className="field" style={{ margin: 0 }}><label>From address</label><input type="email" placeholder="Defaults to your admin email" value={config.emailFromAddress ?? ''} onChange={(e) => set('emailFromAddress', e.target.value)} /></div>
          </div>

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

          <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '1.5rem 0' }} />
          <div>
            <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Send a test email</div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: '0 0 0.75rem' }}>
              Sends using the settings above. Leave blank to send to your own admin address.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="email"
                placeholder="you@example.com"
                value={testEmailTo}
                onChange={(e) => { setTestEmailTo(e.target.value); setTestEmailSent(''); setTestEmailError('') }}
                style={{ flex: 1 }}
              />
              <button className="btn btn-secondary" disabled={testEmailSending} onClick={handleSendTestEmail}>
                {testEmailSending ? 'Sending…' : 'Send test email'}
              </button>
            </div>
            {testEmailSent && <div className="alert alert-success" style={{ marginTop: '0.75rem', fontSize: '0.875rem' }}>Sent to {testEmailSent}.</div>}
            {testEmailError && <div className="alert alert-danger" style={{ marginTop: '0.75rem', fontSize: '0.875rem' }}>{testEmailError}</div>}
          </div>
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

                  <div style={{ display: 'grid', gridTemplateColumns: '0.67fr 0.67fr 2.67fr auto auto', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden', marginBottom: '0.75rem' }}>
                    {(() => {
                      const headerCellStyle = { padding: '0.5rem 0.75rem', fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-muted)', background: 'var(--color-bg-subtle)', borderBottom: '1px solid var(--color-border)' }
                      return (
                        <>
                          <div style={headerCellStyle}>Key</div>
                          <div style={headerCellStyle}>Label</div>
                          <div style={headerCellStyle}>Description</div>
                          <div style={{ ...headerCellStyle, textAlign: 'center' }}>On by default</div>
                          <div style={headerCellStyle}></div>
                        </>
                      )
                    })()}
                    {cats.map((cat, i) => {
                      const cellStyle = { padding: '0.75rem', background: 'var(--color-surface)' }
                      return (
                        <Fragment key={cat.key}>
                          <div className="field" style={{ margin: 0, ...cellStyle }}>
                            <input
                              type="text"
                              value={cat.key}
                              disabled={cat.required}
                              onChange={(e) => updateCategory(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })}
                              style={{ width: '100%', fontSize: '0.8125rem' }}
                            />
                          </div>
                          <div className="field" style={{ margin: 0, ...cellStyle }}>
                            <input type="text" value={cat.label} onChange={(e) => updateCategory(i, { label: e.target.value })} style={{ width: '100%', fontSize: '0.8125rem' }} />
                          </div>
                          <div className="field" style={{ margin: 0, ...cellStyle }}>
                            <input type="text" value={cat.description} onChange={(e) => updateCategory(i, { description: e.target.value })} style={{ width: '100%', fontSize: '0.8125rem' }} />
                          </div>
                          <div className="field" style={{ margin: 0, ...cellStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <input type="checkbox" checked={cat.required ? true : cat.defaultOn} disabled={cat.required} onChange={(e) => updateCategory(i, { defaultOn: e.target.checked })} style={{ width: '1.25rem', height: '1.25rem' }} />
                          </div>
                          <div style={{ ...cellStyle, display: 'flex', alignItems: 'center' }}>
                            {cat.required ? (
                              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Required</span>
                            ) : (
                              <button type="button" onClick={() => removeCategory(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-destructive)', fontSize: '0.8125rem', padding: '0.25rem 0.5rem', marginLeft: '-0.5rem' }}>Remove</button>
                            )}
                          </div>
                        </Fragment>
                      )
                    })}
                  </div>

                  <button type="button" className="btn btn-secondary btn-sm" onClick={addCategory} style={{ marginBottom: availableSuggestions.length > 0 ? '0.5rem' : 0 }}>
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

            {canViewMembersGdpr && (
              <>
                <MembersGdprClient />
                {membersGdprExtensions}
              </>
            )}
          </div>
        )
      })()}

      {tab === 'branding' && (() => {
        const provider = config.mediaProvider ?? null
        // Mirror the server upload gate: a provider must be selected and every
        // env var it needs present (proxied providers also need the Worker URL).
        const mediaReady = !!provider && envKeysForProvider(provider).every((k) => envStatus[k])

        if (!mediaReady) {
          return (
            <div className="alert alert-info">
              Logo and favicon upload requires a media provider to be configured first. Choose one and add its credentials in the Media tab.
            </div>
          )
        }

        return (
          <div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: '1.25rem' }}>
              Upload the logo and favicon for your site. The logo appears in your header and on system pages; the favicon is the small icon in the browser tab. Press <strong>Save changes</strong> when you&apos;re done.
            </p>
            <BrandingImageField
              label="Site logo"
              hint="Shown in your site header and on the coming-soon, maintenance, and not-found pages. JPEG, PNG, WebP, or GIF."
              previewUrl={logoPreview}
              mediaId={config.logoMediaId ?? null}
              allowOptimise
              onUploaded={(m) => { setConfig((p) => ({ ...p, logoMediaId: m.id })); setLogoPreview(m.url) }}
              onRemove={() => { setConfig((p) => ({ ...p, logoMediaId: null })); setLogoPreview(null) }}
            />
            <BrandingImageField
              label="Favicon"
              hint="The small icon shown in browser tabs and bookmarks. A square image of at least 96×96 works best. JPEG, PNG, WebP, or GIF."
              previewUrl={faviconPreview}
              square
              onUploaded={(m) => { setConfig((p) => ({ ...p, faviconMediaId: m.id })); setFaviconPreview(m.url) }}
              onRemove={() => { setConfig((p) => ({ ...p, faviconMediaId: null })); setFaviconPreview(null) }}
            />
          </div>
        )
      })()}

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
                {PROVIDER_SETUP_LINKS[selected].length > 0 && (
                  <div className="alert alert-info" style={{ fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
                    <strong>Where to find these:</strong>{' '}
                    {PROVIDER_SETUP_LINKS[selected].map((l, i) => (
                      <span key={l.url}>
                        {i > 0 && <span style={{ opacity: 0.5 }}> · </span>}
                        <a href={l.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>{l.label} ↗</a>
                      </span>
                    ))}
                  </div>
                )}
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
                    <div style={{ border: '1px solid var(--color-primary-border)', borderRadius: 'var(--radius)', padding: '0.85rem', marginBottom: '0.75rem', background: 'var(--color-primary-subtle)' }}>
                        <h4 style={{ margin: '0 0 0.25rem', fontSize: '0.9rem' }}>Set up the Worker automatically</h4>
                        <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '0 0 0.75rem' }}>
                          Paste a Cloudflare credential and Cactus creates and configures the Worker for you - no terminal, no dashboard hunting. Cloudflare&apos;s free plan is fine.
                        </p>
                        {localMode ? (
                          <div className="alert alert-info" style={{ fontSize: '0.8125rem', margin: 0 }}>
                            Automatic deployment runs on your live site, not in local development (credentials are written to your Vercel project). Deploy from your deployed admin and the credential fields appear here.
                          </div>
                        ) : (
                        <>
                        <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.6rem', fontSize: '0.8125rem', flexWrap: 'wrap' }}>
                          <label style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', cursor: 'pointer' }}>
                            <input type="radio" name="cf-auth-mode" checked={cfAuthMode === 'token'} onChange={() => setCfAuthMode('token')} />
                            API token <span style={{ color: 'var(--color-text-muted)' }}>(recommended)</span>
                          </label>
                          <label style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', cursor: 'pointer' }}>
                            <input type="radio" name="cf-auth-mode" checked={cfAuthMode === 'global'} onChange={() => setCfAuthMode('global')} />
                            Global API Key
                          </label>
                        </div>
                        {cfAuthMode === 'token' ? (
                          <div className="field">
                            <label style={{ fontSize: '0.8125rem' }}>Cloudflare API token</label>
                            <input type="password" autoComplete="off" value={cfToken} onChange={(e) => setCfToken(e.target.value)} placeholder="Paste your API token" style={{ fontSize: '0.875rem' }} />
                            <span className="field-hint">
                              <a href={CLOUDFLARE_API_TOKENS_URL} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>Create a token ↗</a>
                              {' '}- click <strong>Create Custom Token</strong> and grant: {CLOUDFLARE_TOKEN_PERMISSIONS.join('; ')}.
                            </span>
                          </div>
                        ) : (
                          <>
                            <div className="field">
                              <label style={{ fontSize: '0.8125rem' }}>Cloudflare account email</label>
                              <input type="email" autoComplete="off" value={cfEmail} onChange={(e) => setCfEmail(e.target.value)} placeholder="you@example.com" style={{ fontSize: '0.875rem' }} />
                            </div>
                            <div className="field">
                              <label style={{ fontSize: '0.8125rem' }}>Global API Key</label>
                              <input type="password" autoComplete="off" value={cfGlobalKey} onChange={(e) => setCfGlobalKey(e.target.value)} placeholder="Paste your Global API Key" style={{ fontSize: '0.875rem' }} />
                              <span className="field-hint">
                                <a href={CLOUDFLARE_API_TOKENS_URL} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>Find your Global API Key ↗</a>
                                {' '}- same page, under <strong>API Keys</strong>. It has full account access, so a scoped token is safer.
                              </span>
                            </div>
                          </>
                        )}
                        <div className="field">
                          <label style={{ fontSize: '0.8125rem' }}>Account ID <span style={{ color: 'var(--color-text-muted)' }}>(optional)</span></label>
                          <input type="text" autoComplete="off" value={cfAccountId} onChange={(e) => setCfAccountId(e.target.value)} placeholder="Auto-detected - only needed if you have several Cloudflare accounts" style={{ fontSize: '0.875rem' }} />
                        </div>
                        {cfResult && (
                          <div className={cfResult.ok ? 'alert alert-success' : 'alert alert-danger'} style={{ fontSize: '0.8125rem', margin: '0.5rem 0 0' }}>
                            {cfResult.message}
                          </div>
                        )}
                        <button
                          className="btn btn-primary"
                          style={{ fontSize: '0.875rem', marginTop: '0.6rem' }}
                          disabled={cfDeploying || (cfAuthMode === 'token' ? !cfToken.trim() : !(cfEmail.trim() && cfGlobalKey.trim()))}
                          onClick={() => handleDeployWorker(selected)}
                        >
                          {cfDeploying ? 'Deploying…' : 'Deploy Worker'}
                        </button>
                        </>
                        )}
                      </div>
                    <details style={{ fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
                      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                        Prefer to set it up yourself?
                      </summary>
                      <div style={{ marginTop: '0.75rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                        <p style={{ margin: '0 0 0.5rem' }}>
                          Your images are served through a small helper (a &ldquo;Worker&rdquo;) that runs free on Cloudflare.
                          You set it up once, entirely on Cloudflare&apos;s website - there&apos;s nothing to install on your computer.
                        </p>
                        <ol style={{ margin: '0 0 0.5rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <li>
                            Sign in to the{' '}
                            <a href={CLOUDFLARE_DASH_URL} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>Cloudflare dashboard ↗</a>
                            {' '}(the free plan is fine - create an account if you haven&apos;t got one).
                          </li>
                          <li>In the left-hand menu open <strong>Workers &amp; Pages</strong>, click <strong>Create</strong>, then <strong>Create Worker</strong>.</li>
                          <li>Give it a name (for example <code>cactus-media</code>) and click <strong>Deploy</strong>. Cloudflare gives it a web address ending in <code>.workers.dev</code>.</li>
                          <li>Click <strong>Edit code</strong>, replace the sample with the Cactus media-worker code (in your site&apos;s <code>workers/media-worker</code> folder), then click <strong>Deploy</strong> again. Not comfortable with this step? It&apos;s a one-off - ask whoever set up your site to do it.</li>
                          <li>
                            Open the worker&apos;s <strong>Settings</strong>, then <strong>Variables and Secrets</strong>, and add each of the following, pasting the same value you entered above. Tick <strong>Encrypt</strong> for anything that&apos;s a key, token or password:
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', margin: '0.4rem 0 0' }}>
                              {[...WORKER_SECRET_KEYS[selected], 'ALLOWED_ORIGIN'].map((k) => (
                                <code key={k} style={{ background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.1rem 0.4rem', fontSize: '0.75rem' }}>{k}</code>
                              ))}
                            </div>
                            <span style={{ display: 'block', marginTop: '0.35rem' }}>
                              <code>ALLOWED_ORIGIN</code> is simply your website address (for example <code>https://example.com</code>).
                            </span>
                          </li>
                          <li>Copy the worker&apos;s web address (the <code>.workers.dev</code> one) and paste it into <code>{CLOUDFLARE_WORKER_VAR.key}</code> above.</li>
                        </ol>
                      </div>
                    </details>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'stretch' }}>
            {/* eslint-disable-next-line react-hooks/static-components -- GitHubAppCard and EnvSectionCard are render helpers; extracting them would require threading ~20 state values as props */}
            <GitHubAppCard />
            {INTEGRATION_SECTIONS.map((section) => (
              <EnvSectionCard key={section.id} section={section} />
            ))}
          </div>
        </div>
      )}

      {moduleTabs.map((t) => {
        if (tab !== t.id) return null
        const ModuleTab = moduleSettingsTabComponents[t.id]
        return ModuleTab ? <ModuleTab key={t.id} /> : null
      })}
    </div>
  )
}

export default ConfigPageInner
