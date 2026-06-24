'use client'

import { useState, useEffect } from 'react'

type SiteConfig = {
  siteName: string; tagline: string; description: string;
  timezone: string; locale: string; dateFormat: string; timeFormat: string;
  adminPath: string; status: string; hideFromCrawlers: boolean;
  publicRegistration: boolean; trustDeviceDays: number;
  emailFromName: string; emailFromAddress: string; emailProvider: string;
  imageProvider: string;
  comingSoonPageId: string; maintenancePageId: string;
  privacyPolicyPageId: string; termsPageId: string;
  sessionPurgeAfterDays: number; recoveryPurgeAfterDays: number;
  mainMenuId: string | null;
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

const MEDIA_SECTION: EnvSection = {
  id: 'media',
  label: 'Backblaze B2 + Cloudflare Worker',
  description: 'Object storage for images, logo, and favicon',
  keys: [
    { key: 'B2_APPLICATION_KEY_ID', label: 'B2_APPLICATION_KEY_ID', placeholder: 'Key ID' },
    { key: 'B2_APPLICATION_KEY', label: 'B2_APPLICATION_KEY', type: 'password', placeholder: 'Application key' },
    { key: 'B2_BUCKET_NAME', label: 'B2_BUCKET_NAME', placeholder: 'my-bucket' },
    { key: 'B2_ENDPOINT', label: 'B2_ENDPOINT', placeholder: 'https://s3.us-east-005.backblazeb2.com' },
    { key: 'CLOUDFLARE_WORKER_URL', label: 'CLOUDFLARE_WORKER_URL', placeholder: 'https://media.example.com' },
  ],
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

export default function ConfigPage() {
  const [tab, setTab] = useState<Tab>('general')
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
    <div style={{ maxWidth: 760 }}>
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
            <label>Timezone</label>
            <select value={config.timezone ?? 'UTC'} onChange={(e) => set('timezone', e.target.value)}>
              {['UTC','Europe/London','Europe/Paris','Europe/Berlin','America/New_York','America/Chicago','America/Los_Angeles','Asia/Tokyo','Australia/Sydney'].map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
          <div className="field"><label>Date format</label><input value={config.dateFormat ?? 'DD/MM/YYYY'} onChange={(e) => set('dateFormat', e.target.value)} /></div>
          <div className="field"><label>Time format</label><input value={config.timeFormat ?? 'HH:mm'} onChange={(e) => set('timeFormat', e.target.value)} /></div>
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
          Logo and favicon upload requires media (B2 + Cloudflare Worker) to be configured first. Set credentials in the Media tab.
        </div>
      )}

      {tab === 'media' && (
        <div>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem' }}>
            Media credentials are stored in your Vercel project environment variables and never saved to the database.
          </p>
          <EnvSectionCard section={MEDIA_SECTION} />
        </div>
      )}

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
