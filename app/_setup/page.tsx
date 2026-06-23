'use client'

import { useState, useEffect, useRef } from 'react'
import type { EnvVarStatus } from '@/lib/config/env'
import type { DatabaseState } from '@/app/api/setup/env-check/route'
import { NEON_REGIONS } from '@/lib/config/neon-regions'

type Step = 'env' | 'account' | 'adminPath' | 'essentials' | 'recovery'

// Sub-states within the 'env' step when DATABASE_URL is absent.
type DbSubStep =
  | 'loading'           // env-check in flight
  | 'block'             // non-DB required var missing → hard block
  | 'ready'             // all required vars set (DATABASE_URL present)
  | 'db-choice'         // DATABASE_URL absent, NEON_API_KEY present → offer auto or manual
  | 'db-manual'         // DATABASE_URL absent, NEON_API_KEY absent → manual instructions only
  | 'db-provisioning'   // Neon API call in flight
  | 'db-redeploying'    // env var written, waiting for Vercel redeploy + DB reachable
  | 'db-error'          // Neon API call failed — show error + fall back to manual

type EnvCheckData = {
  required: EnvVarStatus[]
  optional: EnvVarStatus[]
  missingRequired: string[]
  databaseState: DatabaseState
  neonAvailable: boolean
}

// Polls /api/health until the database is reachable, then calls onReady.
// Returns a cancel function.
function startHealthPolling(onReady: () => void): () => void {
  let cancelled = false
  let timer: ReturnType<typeof setTimeout>

  async function poll() {
    if (cancelled) return
    try {
      const res = await fetch('/api/health')
      if (res.ok) {
        const data = (await res.json()) as { database?: string }
        if (data.database === 'connected') {
          if (!cancelled) onReady()
          return
        }
      }
    } catch {
      // Network error during redeploy is expected — keep polling.
    }
    if (!cancelled) timer = setTimeout(poll, 5_000)
  }

  timer = setTimeout(poll, 5_000)
  return () => {
    cancelled = true
    clearTimeout(timer)
  }
}

export default function SetupPage() {
  const [step, setStep] = useState<Step>('env')
  const [envData, setEnvData] = useState<EnvCheckData | null>(null)
  const [dbSubStep, setDbSubStep] = useState<DbSubStep>('loading')
  const [adminPath, setAdminPath] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Database provisioning
  const [neonRegion, setNeonRegion] = useState('aws-us-east-2')
  const [provisionError, setProvisionError] = useState('')
  const [dbReady, setDbReady] = useState(false)
  const cancelPollingRef = useRef<(() => void) | null>(null)

  // Account fields
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [passkeyRegistered, setPasskeyRegistered] = useState(false)
  const [userId, setUserId] = useState('')

  // Essentials
  const [siteName, setSiteName] = useState('')
  const [timezone, setTimezone] = useState('UTC')

  const steps: Step[] = ['env', 'account', 'adminPath', 'essentials', 'recovery']
  const stepIndex = steps.indexOf(step)

  // Clean up health poll on unmount.
  useEffect(() => {
    return () => {
      cancelPollingRef.current?.()
    }
  }, [])

  // ── Step 1: Environment check ──────────────────────────────────────────────
  useEffect(() => {
    if (step !== 'env') return
    setDbSubStep('loading')

    fetch('/api/setup/env-check')
      .then((r) => r.json())
      .then((d: EnvCheckData) => {
        setEnvData(d)

        // Non-DB required vars missing → hard block.
        const nonDbMissing = d.missingRequired.filter((v) => v !== 'DATABASE_URL')
        if (nonDbMissing.length > 0) {
          setDbSubStep('block')
          return
        }

        if (d.databaseState === 'set') {
          setDbSubStep('ready')
        } else if (d.databaseState === 'provisioned-redeploying') {
          // A previous provision wrote the env var; waiting for redeploy.
          setDbSubStep('db-redeploying')
          startRedeployPolling()
        } else if (d.neonAvailable) {
          setDbSubStep('db-choice')
        } else {
          setDbSubStep('db-manual')
        }
      })
      .catch(() => {
        setError('Failed to load environment status')
        setDbSubStep('block')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  function startRedeployPolling() {
    cancelPollingRef.current?.()
    cancelPollingRef.current = startHealthPolling(() => {
      setDbReady(true)
    })
  }

  async function handleProvision() {
    setProvisionError('')
    setDbSubStep('db-provisioning')
    try {
      const res = await fetch('/api/setup/provision-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region: neonRegion }),
      })
      const data = (await res.json()) as {
        status?: string
        error?: string
      }

      if (!res.ok || data.status === 'error') {
        setProvisionError(data.error ?? 'Database provisioning failed')
        setDbSubStep('db-error')
        return
      }

      if (data.status === 'already_set') {
        // DATABASE_URL is already in runtime — continue normally.
        setDbSubStep('ready')
        return
      }

      // status === 'provisioned' or 'provisioned-redeploying'
      setDbSubStep('db-redeploying')
      startRedeployPolling()
    } catch (err: unknown) {
      setProvisionError(err instanceof Error ? err.message : 'Network error')
      setDbSubStep('db-error')
    }
  }

  // ── Step 2: Register passkey ───────────────────────────────────────────────
  async function handleCreateAccount() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/setup/create-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Failed to create account')
      }
      const { userId: uid } = await res.json()
      setUserId(uid)

      const { startRegistration } = await import('@simplewebauthn/browser')
      const optRes = await fetch('/api/auth/passkey/register-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid }),
      })
      const opts = await optRes.json()
      const attestation = await startRegistration({ optionsJSON: opts })

      const verifyRes = await fetch('/api/auth/passkey/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid, attestation }),
      })
      if (!verifyRes.ok) {
        const d = await verifyRes.json()
        throw new Error(d.error ?? 'Passkey registration failed')
      }

      setPasskeyRegistered(true)
      setStep('adminPath')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 3: Set admin path ─────────────────────────────────────────────────
  useEffect(() => {
    if (step === 'adminPath') {
      fetch('/api/setup/suggest-path')
        .then((r) => r.json())
        .then((d: { path: string }) => setAdminPath(d.path))
        .catch(() => {})
    }
  }, [step])

  async function handleAdminPath() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/setup/set-admin-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPath }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Invalid admin path')
      }
      setStep('essentials')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 4: Site essentials ────────────────────────────────────────────────
  async function handleEssentials() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/setup/essentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteName, timezone }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Failed to save settings')
      }
      setStep('recovery')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 5: Recovery code ──────────────────────────────────────────────────
  useEffect(() => {
    if (step === 'recovery') {
      fetch('/api/setup/recovery-code', { method: 'POST' })
        .then((r) => r.json())
        .then((d: { code: string }) => setRecoveryCode(d.code))
        .catch(() => setError('Failed to generate recovery code'))
    }
  }, [step])

  async function handleFinish() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/setup/complete', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to complete setup')
      const { adminPath: ap } = await res.json()
      window.location.href = `/${ap}`
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="setup-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div style={{ width: 36, height: 36, background: '#16a34a', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '1.25rem' }}>🌵</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.125rem' }}>Cactus Setup</div>
          <div style={{ fontSize: '0.8125rem', color: '#6b7280' }}>Step {stepIndex + 1} of {steps.length}</div>
        </div>
      </div>

      <div className="setup-steps" style={{ marginBottom: '2rem' }}>
        {steps.map((s, i) => (
          <div
            key={s}
            className={`setup-step ${i < stepIndex ? 'done' : i === stepIndex ? 'active' : ''}`}
          />
        ))}
      </div>

      {error && <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>{error}</div>}

      {/* ── Step: ENV CHECK ── */}
      {step === 'env' && (
        <div>
          <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.25rem' }}>Environment check</h2>
          <p style={{ color: '#6b7280', fontSize: '0.9375rem', margin: '0 0 1.5rem' }}>
            Cactus needs a few environment variables before it can start.
          </p>

          {/* Loading */}
          {dbSubStep === 'loading' && <p>Checking…</p>}

          {/* Vars list (shown in all non-loading sub-steps) */}
          {envData && dbSubStep !== 'loading' && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem' }}>Required</div>
              {envData.required.map((v) => {
                // DATABASE_URL is shown differently depending on sub-step.
                if (v.name === 'DATABASE_URL') return null
                return (
                  <div key={v.name} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <span style={{ color: v.set ? '#16a34a' : '#dc2626', fontWeight: 700, flexShrink: 0 }}>{v.set ? '✓' : '✗'}</span>
                    <div>
                      <code style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{v.name}</code>
                      {!v.set && (
                        <div style={{ fontSize: '0.8125rem', color: '#dc2626' }}>{v.description}</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Hard block: non-DB required vars missing */}
          {dbSubStep === 'block' && envData && (
            <div className="alert alert-danger">
              Missing required variables:{' '}
              <strong>{envData.missingRequired.filter((v) => v !== 'DATABASE_URL').join(', ')}</strong>.
              Add them to your project&apos;s environment variables in the Vercel dashboard and redeploy.
            </div>
          )}

          {/* All required vars set (DATABASE_URL is present) */}
          {dbSubStep === 'ready' && envData && (
            <>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <span style={{ color: '#16a34a', fontWeight: 700, flexShrink: 0 }}>✓</span>
                <code style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>DATABASE_URL</code>
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem' }}>Optional</div>
                {envData.optional.map((v) => (
                  <div key={v.name} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <span style={{ color: v.set ? '#16a34a' : '#9ca3af', flexShrink: 0 }}>{v.set ? '✓' : '○'}</span>
                    <div>
                      <code style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{v.name}</code>
                      {!v.set && v.gates && (
                        <div style={{ fontSize: '0.8125rem', color: '#d97706' }}>Disabled: {v.gates}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={() => setStep('account')}>
                Continue →
              </button>
            </>
          )}

          {/* DATABASE_URL absent, Neon available: offer auto-provision or manual */}
          {dbSubStep === 'db-choice' && (
            <DbChoicePanel
              neonRegion={neonRegion}
              setNeonRegion={setNeonRegion}
              onProvision={handleProvision}
              onManual={() => setDbSubStep('db-manual')}
            />
          )}

          {/* DATABASE_URL absent, no Neon key: manual instructions only */}
          {dbSubStep === 'db-manual' && (
            <DbManualPanel
              neonAvailable={false}
              onBack={envData?.neonAvailable ? () => setDbSubStep('db-choice') : undefined}
            />
          )}

          {/* Neon API call in flight */}
          {dbSubStep === 'db-provisioning' && (
            <div>
              <div className="alert alert-info" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.25rem' }}>⏳</span>
                <span>Creating your Neon database… this usually takes 5–10 seconds.</span>
              </div>
            </div>
          )}

          {/* Neon call succeeded, Vercel redeploying */}
          {dbSubStep === 'db-redeploying' && (
            <DbRedeployingPanel dbReady={dbReady} onContinue={() => setStep('account')} />
          )}

          {/* Neon call failed: show error + fall back to manual */}
          {dbSubStep === 'db-error' && (
            <div>
              <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
                <strong>Database provisioning failed</strong>
                {provisionError && (
                  <div style={{ fontSize: '0.8125rem', marginTop: '0.25rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    {provisionError}
                  </div>
                )}
              </div>
              <DbManualPanel
                neonAvailable={!!envData?.neonAvailable}
                onBack={() => setDbSubStep('db-choice')}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Step: ADMIN ACCOUNT ── */}
      {step === 'account' && (
        <div>
          <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.25rem' }}>Create your admin account</h2>
          <p style={{ color: '#6b7280', fontSize: '0.9375rem', margin: '0 0 1.5rem' }}>
            You&apos;ll register a passkey (fingerprint, Face ID, or security key) as your primary login method.
          </p>
          {!passkeyRegistered ? (
            <>
              <div className="field">
                <label htmlFor="username">Username</label>
                <input id="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. alice" autoComplete="username" />
                <span className="field-hint">Your public-facing handle. Used in bylines, not for login.</span>
              </div>
              <div className="field">
                <label htmlFor="email">Email address</label>
                <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
                <span className="field-hint">Used for account recovery if you add email credentials later.</span>
              </div>
              <button
                className="btn btn-primary btn-lg"
                style={{ width: '100%' }}
                disabled={!username || !email || loading}
                onClick={handleCreateAccount}
              >
                {loading ? 'Registering…' : 'Register passkey →'}
              </button>
            </>
          ) : (
            <div className="alert alert-success">Passkey registered successfully!</div>
          )}
        </div>
      )}

      {/* ── Step: ADMIN PATH ── */}
      {step === 'adminPath' && (
        <div>
          <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.25rem' }}>Choose your admin path</h2>
          <p style={{ color: '#6b7280', fontSize: '0.9375rem', margin: '0 0 1.5rem' }}>
            This is the secret URL prefix for your admin area. Anyone who doesn&apos;t know it gets a plain 404.
          </p>
          <div className="field">
            <label htmlFor="adminPath">Admin path</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <span style={{ padding: '0.5rem 0.75rem', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: '0.9375rem', color: '#6b7280', flexShrink: 0 }}>
                {typeof window !== 'undefined' ? window.location.hostname : 'yourdomain.com'}/
              </span>
              <input
                id="adminPath"
                value={adminPath}
                onChange={(e) => setAdminPath(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="lemon-4f8a2c"
                style={{ flex: 1 }}
              />
            </div>
            <span className="field-hint">Lowercase letters, numbers, and hyphens only.</span>
          </div>
          <button
            className="btn btn-primary btn-lg"
            style={{ width: '100%' }}
            disabled={!adminPath || loading}
            onClick={handleAdminPath}
          >
            {loading ? 'Saving…' : 'Set admin path →'}
          </button>
        </div>
      )}

      {/* ── Step: ESSENTIALS ── */}
      {step === 'essentials' && (
        <div>
          <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.25rem' }}>Site essentials</h2>
          <p style={{ color: '#6b7280', fontSize: '0.9375rem', margin: '0 0 1.5rem' }}>
            A few basics to get your site ready.
          </p>
          <div className="field">
            <label htmlFor="siteName">Site name</label>
            <input id="siteName" value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="My Cactus Site" />
          </div>
          <div className="field">
            <label htmlFor="timezone">Timezone</label>
            <select id="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              <option value="UTC">UTC</option>
              <option value="Europe/London">Europe/London</option>
              <option value="Europe/Paris">Europe/Paris</option>
              <option value="Europe/Berlin">Europe/Berlin</option>
              <option value="America/New_York">America/New_York</option>
              <option value="America/Chicago">America/Chicago</option>
              <option value="America/Denver">America/Denver</option>
              <option value="America/Los_Angeles">America/Los_Angeles</option>
              <option value="Asia/Tokyo">Asia/Tokyo</option>
              <option value="Asia/Shanghai">Asia/Shanghai</option>
              <option value="Asia/Kolkata">Asia/Kolkata</option>
              <option value="Australia/Sydney">Australia/Sydney</option>
            </select>
          </div>
          <div className="alert alert-info" style={{ fontSize: '0.875rem' }}>
            <strong>Site URL:</strong> <code>{typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin : ''}</code><br />
            This is read from <code>SITE_URL</code> and is the WebAuthn relying party ID. It cannot be changed here.
          </div>
          <button
            className="btn btn-primary btn-lg"
            style={{ width: '100%' }}
            disabled={!siteName || loading}
            onClick={handleEssentials}
          >
            {loading ? 'Saving…' : 'Continue →'}
          </button>
        </div>
      )}

      {/* ── Step: RECOVERY CODE ── */}
      {step === 'recovery' && (
        <div>
          <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.25rem' }}>Save your recovery code</h2>
          <p style={{ color: '#6b7280', fontSize: '0.9375rem', margin: '0 0 1.5rem' }}>
            If you lose access to your passkey, this code is your only way back in. It&apos;s single-use. <strong>Save it somewhere safe offline before continuing.</strong>
          </p>
          {!recoveryCode ? (
            <p>Generating…</p>
          ) : (
            <>
              <div style={{
                fontFamily: 'monospace',
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: 6,
                padding: '1rem',
                fontSize: '0.9375rem',
                wordBreak: 'break-all',
                marginBottom: '1rem',
                userSelect: 'all',
              }}>
                {recoveryCode}
              </div>
              <div className="alert alert-warning" style={{ fontSize: '0.875rem' }}>
                This code is shown once and is not stored in plain text. Copy it now.
              </div>
              <button
                className="btn btn-primary btn-lg"
                style={{ width: '100%' }}
                disabled={loading}
                onClick={handleFinish}
              >
                {loading ? 'Finishing…' : "I've saved it — go to admin →"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sub-components for the database provisioning flow ─────────────────────────

function DbChoicePanel({
  neonRegion,
  setNeonRegion,
  onProvision,
  onManual,
}: {
  neonRegion: string
  setNeonRegion: (r: string) => void
  onProvision: () => void
  onManual: () => void
}) {
  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
        <span style={{ color: '#dc2626', fontWeight: 700, flexShrink: 0 }}>✗</span>
        <div>
          <code style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>DATABASE_URL</code>
          <div style={{ fontSize: '0.8125rem', color: '#6b7280' }}>No database connected yet — choose an option below.</div>
        </div>
      </div>

      {/* Option A: auto-provision */}
      <div style={{ border: '1px solid #16a34a', borderRadius: 8, padding: '1rem', marginBottom: '1rem', background: '#f0fdf4' }}>
        <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: '#15803d' }}>Create my database automatically</div>
        <p style={{ fontSize: '0.875rem', color: '#374151', margin: '0 0 0.75rem' }}>
          Cactus will create a free Neon Postgres database in the region you choose and configure it automatically.
          Your app will redeploy once to pick up the connection — this takes about a minute.
        </p>
        <div className="field" style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="neonRegion" style={{ fontSize: '0.875rem' }}>Database region</label>
          <select
            id="neonRegion"
            value={neonRegion}
            onChange={(e) => setNeonRegion(e.target.value)}
            style={{ fontSize: '0.875rem' }}
          >
            {NEON_REGIONS.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
          <span className="field-hint">Choose the region closest to your users.</span>
        </div>
        <button className="btn btn-primary" onClick={onProvision} style={{ width: '100%' }}>
          Create database →
        </button>
      </div>

      {/* Option B: bring your own */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '1rem', background: '#f9fafb' }}>
        <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>I&apos;ll supply my own DATABASE_URL</div>
        <p style={{ fontSize: '0.875rem', color: '#374151', margin: '0 0 0.75rem' }}>
          Add a pooled PostgreSQL connection string to your Vercel project env vars and redeploy.
        </p>
        <button className="btn btn-secondary" onClick={onManual} style={{ fontSize: '0.875rem' }}>
          Show instructions →
        </button>
      </div>
    </div>
  )
}

function DbManualPanel({
  neonAvailable,
  onBack,
}: {
  neonAvailable: boolean
  onBack?: () => void
}) {
  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
        <span style={{ color: '#dc2626', fontWeight: 700, flexShrink: 0 }}>✗</span>
        <div>
          <code style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>DATABASE_URL</code>
        </div>
      </div>

      <div className="alert alert-warning" style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>
        <strong>Action required:</strong> Add a PostgreSQL pooled connection string as{' '}
        <code>DATABASE_URL</code> in your Vercel project&apos;s environment variables, then redeploy.
        Setup will resume automatically once the database is reachable.
      </div>

      <ol style={{ paddingLeft: '1.25rem', fontSize: '0.875rem', color: '#374151', lineHeight: 1.7, marginBottom: '1rem' }}>
        <li>Create a Postgres database at <a href="https://neon.tech" target="_blank" rel="noreferrer" style={{ color: '#16a34a' }}>Neon</a>, <a href="https://supabase.com" target="_blank" rel="noreferrer" style={{ color: '#16a34a' }}>Supabase</a>, or any provider.</li>
        <li>Copy the <strong>pooled</strong> connection string (not the direct/unpooled URL).</li>
        <li>In the Vercel dashboard → your project → <strong>Settings → Environment Variables</strong>, add <code>DATABASE_URL</code> with that value.</li>
        <li>Trigger a redeploy (or push a commit). Migrations will run automatically during the build.</li>
        <li>Return here once the redeploy completes — setup will continue from this step.</li>
      </ol>

      {!neonAvailable && (
        <p style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '1rem' }}>
          Tip: set <code>NEON_API_KEY</code> in your project env vars to let Cactus create a database for you automatically.{' '}
          <a href="/wiki/Getting-started" style={{ color: '#16a34a' }}>See the Getting started guide.</a>
        </p>
      )}

      {onBack && (
        <button className="btn btn-secondary" style={{ fontSize: '0.875rem' }} onClick={onBack}>
          ← Back to options
        </button>
      )}
    </div>
  )
}

function DbRedeployingPanel({
  dbReady,
  onContinue,
}: {
  dbReady: boolean
  onContinue: () => void
}) {
  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
        <span style={{ color: '#16a34a', fontWeight: 700, flexShrink: 0 }}>✓</span>
        <div>
          <code style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>DATABASE_URL</code>
          <div style={{ fontSize: '0.8125rem', color: '#16a34a' }}>Database created and connection string written</div>
        </div>
      </div>

      {!dbReady ? (
        <div className="alert alert-info">
          <strong>Database created.</strong> Your app is redeploying to pick up the new connection — this takes a minute or two.
          During the redeploy, the database schema migrations run automatically via the build script.
          <br /><br />
          This page will continue automatically once the database is reachable.{' '}
          <span style={{ color: '#6b7280' }}>(Checking every 5 seconds…)</span>
        </div>
      ) : (
        <>
          <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
            <strong>Database connected.</strong> The redeploy is complete and the schema is ready.
          </div>
          <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={onContinue}>
            Continue to account setup →
          </button>
        </>
      )}
    </div>
  )
}
