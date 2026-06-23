'use client'

import { useState, useEffect, useRef, type ReactNode } from 'react'
import type { EnvVarStatus } from '@/lib/config/env'
import type { DatabaseState } from '@/app/api/setup/env-check/route'
import { NEON_REGIONS } from '@/lib/config/neon-regions'

type Step = 'env' | 'features' | 'account' | 'adminPath' | 'essentials' | 'recovery'

// Sub-states within the 'env' step.
type DbSubStep =
  | 'loading'              // env-check in flight
  | 'vercel-config'        // VERCEL_API_TOKEN/PROJECT_ID not set → collect them
  | 'vercel-listing'       // fetching project list from Vercel API
  | 'vercel-configuring'   // writing bootstrap env vars to Vercel
  | 'vercel-redeploying'   // waiting for redeploy after bootstrap vars written
  | 'block'                // unexpected required var missing → hard block
  | 'ready'                // all required vars set (DATABASE_URL present)
  | 'db-choice'            // DATABASE_URL absent, NEON_API_KEY present → offer auto or manual
  | 'db-manual'            // DATABASE_URL absent, NEON_API_KEY absent → manual instructions only
  | 'db-provisioning'      // Neon API call in flight
  | 'db-redeploying'       // DATABASE_URL written, waiting for Vercel redeploy + DB reachable
  | 'db-error'             // Neon API call failed — show error + fall back to manual

type EnvCheckData = {
  required: EnvVarStatus[]
  optional: EnvVarStatus[]
  missingRequired: string[]
  databaseState: DatabaseState
  neonAvailable: boolean
  vercelConfigured: boolean
}

type VercelProject = { id: string; name: string; domains: string[] }

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

// Polls /api/setup/env-check until vercelConfigured is true, then calls onReady.
// Returns a cancel function.
function startVercelConfiguredPolling(onReady: () => void): () => void {
  let cancelled = false
  let timer: ReturnType<typeof setTimeout>

  async function poll() {
    if (cancelled) return
    try {
      const res = await fetch('/api/setup/env-check')
      if (res.ok) {
        const data = (await res.json()) as EnvCheckData
        if (data.vercelConfigured) {
          if (!cancelled) onReady(  )
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

  // Vercel config
  const [vercelToken, setVercelToken] = useState('')
  const [vercelNeonKey, setVercelNeonKey] = useState('')
  const [vercelProjects, setVercelProjects] = useState<VercelProject[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [vercelError, setVercelError] = useState('')
  const [vercelConfiguring, setVercelConfiguring] = useState(false)

  // Features step
  const [featureFields, setFeatureFields] = useState<Record<string, string>>({})
  const [featureSaving, setFeatureSaving] = useState(false)
  const [featureError, setFeatureError] = useState('')
  const [emailMode, setEmailMode] = useState<'brevo' | 'smtp'>('brevo')

  // Account fields
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [passkeyRegistered, setPasskeyRegistered] = useState(false)
  const [userId, setUserId] = useState('')

  // Essentials
  const [siteName, setSiteName] = useState('')
  const [timezone, setTimezone] = useState('UTC')

  const steps: Step[] = ['env', 'features', 'account', 'adminPath', 'essentials', 'recovery']
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

        // Vercel not configured → show vercel-config panel
        if (!d.vercelConfigured) {
          setDbSubStep('vercel-config')
          return
        }

        // Any other required var missing that the wizard doesn't handle → hard block
        const unexpectedMissing = d.missingRequired.filter(
          (v) => v !== 'DATABASE_URL' && v !== 'VERCEL_API_TOKEN' && v !== 'VERCEL_PROJECT_ID'
        )
        if (unexpectedMissing.length > 0) {
          setDbSubStep('block')
          return
        }

        if (d.databaseState === 'set') {
          setDbSubStep('ready')
        } else if (d.databaseState === 'provisioned-redeploying') {
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

  function startVercelRedeployPolling() {
    cancelPollingRef.current?.()
    cancelPollingRef.current = startVercelConfiguredPolling(() => {
      // Vercel env vars are now in runtime — re-run the env check
      setDbSubStep('loading')
      setStep('env')
    })
  }

  // ── Vercel config handlers ─────────────────────────────────────────────────

  async function handleVercelListProjects() {
    setVercelError('')
    setDbSubStep('vercel-listing')
    setVercelProjects([])
    setSelectedProjectId('')
    try {
      const res = await fetch('/api/setup/vercel-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list-projects', token: vercelToken }),
      })
      const data = (await res.json()) as { projects?: VercelProject[]; error?: string }
      if (!res.ok || data.error) {
        setVercelError(data.error ?? 'Failed to list projects')
        setDbSubStep('vercel-config')
        return
      }
      const projects = data.projects ?? []
      setVercelProjects(projects)
      setDbSubStep('vercel-config')
      if (projects.length === 1) {
        setSelectedProjectId(projects[0].id)
      }
    } catch (err: unknown) {
      setVercelError(err instanceof Error ? err.message : 'Network error')
      setDbSubStep('vercel-config')
    }
  }

  async function handleVercelConfigure() {
    if (!selectedProjectId) return
    setVercelError('')
    setVercelConfiguring(true)
    setDbSubStep('vercel-configuring')
    try {
      const res = await fetch('/api/setup/vercel-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'configure',
          token: vercelToken,
          projectId: selectedProjectId,
          neonApiKey: vercelNeonKey || undefined,
        }),
      })
      const data = (await res.json()) as {
        status?: string
        siteUrl?: string
        redeployTriggered?: boolean
        error?: string
      }
      if (!res.ok || data.error) {
        setVercelError(data.error ?? 'Failed to configure project')
        setDbSubStep('vercel-config')
        setVercelConfiguring(false)
        return
      }
      setDbSubStep('vercel-redeploying')
      startVercelRedeployPolling()
    } catch (err: unknown) {
      setVercelError(err instanceof Error ? err.message : 'Network error')
      setDbSubStep('vercel-config')
    } finally {
      setVercelConfiguring(false)
    }
  }

  function setFeatureField(key: string, value: string) {
    setFeatureFields((prev) => ({ ...prev, [key]: value }))
  }

  async function handleFeatures(skip = false) {
    if (skip) {
      setStep('account')
      return
    }
    setFeatureError('')
    setFeatureSaving(true)
    try {
      const vars = Object.entries(featureFields)
        .filter(([, v]) => v.trim() !== '')
        .map(([key, value]) => ({ key, value }))

      if (vars.length > 0) {
        const res = await fetch('/api/setup/configure-env', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vars }),
        })
        if (!res.ok) {
          const d = (await res.json()) as { error?: string }
          throw new Error(d.error ?? 'Failed to save environment variables')
        }
      }
      setStep('account')
    } catch (err: unknown) {
      setFeatureError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setFeatureSaving(false)
    }
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
        setDbSubStep('ready')
        return
      }

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
            Cactus needs to connect to your Vercel project before it can start.
          </p>

          {dbSubStep === 'loading' && <p>Checking…</p>}

          {/* ── Vercel not yet configured ── */}
          {(dbSubStep === 'vercel-config' || dbSubStep === 'vercel-listing') && (
            <VercelConfigPanel
              token={vercelToken}
              setToken={setVercelToken}
              neonApiKey={vercelNeonKey}
              setNeonApiKey={setVercelNeonKey}
              projects={vercelProjects}
              selectedProjectId={selectedProjectId}
              setSelectedProjectId={setSelectedProjectId}
              listing={dbSubStep === 'vercel-listing'}
              error={vercelError}
              onConnect={handleVercelListProjects}
              onConfigure={handleVercelConfigure}
            />
          )}

          {/* ── Writing Vercel env vars ── */}
          {dbSubStep === 'vercel-configuring' && (
            <div className="alert alert-info" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.25rem' }}>⏳</span>
              <span>Writing environment variables to your Vercel project…</span>
            </div>
          )}

          {/* ── Waiting for Vercel redeploy after bootstrap ── */}
          {dbSubStep === 'vercel-redeploying' && (
            <div>
              <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
                <strong>Vercel project configured.</strong> SESSION_SECRET, SITE_URL, and API credentials have been written to your project.
              </div>
              <div className="alert alert-info">
                Your app is redeploying to pick up the new settings — this takes about a minute.
                This page will continue automatically once the redeploy is complete.{' '}
                <span style={{ color: '#6b7280' }}>(Checking every 5 seconds…)</span>
              </div>
              <p style={{ fontSize: '0.8125rem', color: '#6b7280', marginTop: '1rem' }}>
                If this takes more than 3 minutes, trigger a manual redeploy from your{' '}
                <a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer" style={{ color: '#16a34a' }}>Vercel dashboard</a>.
              </p>
            </div>
          )}

          {/* Vars list (shown in all post-vercel sub-steps) */}
          {envData && !['loading', 'vercel-config', 'vercel-listing', 'vercel-configuring', 'vercel-redeploying'].includes(dbSubStep) && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem' }}>Required</div>
              {envData.required.map((v) => {
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

          {/* Hard block */}
          {dbSubStep === 'block' && envData && (
            <div className="alert alert-danger">
              Unexpected missing variables:{' '}
              <strong>
                {envData.missingRequired
                  .filter((v) => v !== 'DATABASE_URL' && v !== 'VERCEL_API_TOKEN' && v !== 'VERCEL_PROJECT_ID')
                  .join(', ')}
              </strong>.
              Add them to your Vercel project environment variables and redeploy.
            </div>
          )}

          {/* All required vars set */}
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
              <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={() => setStep('features')}>
                Continue →
              </button>
            </>
          )}

          {/* DATABASE_URL absent, Neon available */}
          {dbSubStep === 'db-choice' && (
            <DbChoicePanel
              neonRegion={neonRegion}
              setNeonRegion={setNeonRegion}
              onProvision={handleProvision}
              onManual={() => setDbSubStep('db-manual')}
            />
          )}

          {/* DATABASE_URL absent, no Neon key */}
          {dbSubStep === 'db-manual' && (
            <DbManualPanel
              neonAvailable={!!envData?.neonAvailable}
              onBack={envData?.neonAvailable ? () => setDbSubStep('db-choice') : undefined}
            />
          )}

          {dbSubStep === 'db-provisioning' && (
            <div>
              <div className="alert alert-info" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.25rem' }}>⏳</span>
                <span>Creating your Neon database… this usually takes 5–10 seconds.</span>
              </div>
            </div>
          )}

          {dbSubStep === 'db-redeploying' && (
            <DbRedeployingPanel dbReady={dbReady} onContinue={() => setStep('features')} />
          )}

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

      {/* ── Step: OPTIONAL FEATURES ── */}
      {step === 'features' && (
        <div>
          <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.25rem' }}>Configure optional features</h2>
          <p style={{ color: '#6b7280', fontSize: '0.9375rem', margin: '0 0 0.5rem' }}>
            Enter credentials for the features you want to enable. You can skip this and configure everything later in Settings.
          </p>
          <div className="alert alert-info" style={{ fontSize: '0.8125rem', marginBottom: '1.5rem' }}>
            Values are saved directly to your Vercel project environment variables and take effect on the next deployment.
          </div>

          {featureError && <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>{featureError}</div>}

          {/* Email */}
          <FeatureSection title="Email" description="Required for password login, verification emails, and account recovery.">
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
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
            {emailMode === 'brevo' ? (
              <div className="field">
                <label style={{ fontSize: '0.875rem' }}>BREVO_API_KEY</label>
                <input
                  type="password"
                  autoComplete="off"
                  value={featureFields['BREVO_API_KEY'] ?? ''}
                  onChange={(e) => setFeatureField('BREVO_API_KEY', e.target.value)}
                  placeholder="xkeysib-…"
                  style={{ fontSize: '0.875rem' }}
                />
                <span className="field-hint">Create at brevo.com → Settings → API Keys</span>
              </div>
            ) : (
              <>
                <div className="field">
                  <label style={{ fontSize: '0.875rem' }}>SMTP_HOST</label>
                  <input value={featureFields['SMTP_HOST'] ?? ''} onChange={(e) => setFeatureField('SMTP_HOST', e.target.value)} placeholder="smtp.example.com" style={{ fontSize: '0.875rem' }} />
                </div>
                <div className="field">
                  <label style={{ fontSize: '0.875rem' }}>SMTP_PORT</label>
                  <input value={featureFields['SMTP_PORT'] ?? ''} onChange={(e) => setFeatureField('SMTP_PORT', e.target.value)} placeholder="587" style={{ fontSize: '0.875rem' }} />
                </div>
                <div className="field">
                  <label style={{ fontSize: '0.875rem' }}>SMTP_USER</label>
                  <input autoComplete="off" value={featureFields['SMTP_USER'] ?? ''} onChange={(e) => setFeatureField('SMTP_USER', e.target.value)} placeholder="you@example.com" style={{ fontSize: '0.875rem' }} />
                </div>
                <div className="field">
                  <label style={{ fontSize: '0.875rem' }}>SMTP_PASS</label>
                  <input type="password" autoComplete="new-password" value={featureFields['SMTP_PASS'] ?? ''} onChange={(e) => setFeatureField('SMTP_PASS', e.target.value)} placeholder="••••••••" style={{ fontSize: '0.875rem' }} />
                </div>
              </>
            )}
          </FeatureSection>

          {/* Media */}
          <FeatureSection title="Media (Backblaze B2)" description="Required for image uploads, logo, and favicon.">
            <div className="field">
              <label style={{ fontSize: '0.875rem' }}>B2_APPLICATION_KEY_ID</label>
              <input value={featureFields['B2_APPLICATION_KEY_ID'] ?? ''} onChange={(e) => setFeatureField('B2_APPLICATION_KEY_ID', e.target.value)} placeholder="Key ID" style={{ fontSize: '0.875rem' }} />
            </div>
            <div className="field">
              <label style={{ fontSize: '0.875rem' }}>B2_APPLICATION_KEY</label>
              <input type="password" autoComplete="off" value={featureFields['B2_APPLICATION_KEY'] ?? ''} onChange={(e) => setFeatureField('B2_APPLICATION_KEY', e.target.value)} placeholder="Application key" style={{ fontSize: '0.875rem' }} />
            </div>
            <div className="field">
              <label style={{ fontSize: '0.875rem' }}>B2_BUCKET_NAME</label>
              <input value={featureFields['B2_BUCKET_NAME'] ?? ''} onChange={(e) => setFeatureField('B2_BUCKET_NAME', e.target.value)} placeholder="my-bucket" style={{ fontSize: '0.875rem' }} />
            </div>
            <div className="field">
              <label style={{ fontSize: '0.875rem' }}>B2_ENDPOINT</label>
              <input value={featureFields['B2_ENDPOINT'] ?? ''} onChange={(e) => setFeatureField('B2_ENDPOINT', e.target.value)} placeholder="https://s3.us-east-005.backblazeb2.com" style={{ fontSize: '0.875rem' }} />
            </div>
            <div className="field">
              <label style={{ fontSize: '0.875rem' }}>CLOUDFLARE_WORKER_URL</label>
              <input value={featureFields['CLOUDFLARE_WORKER_URL'] ?? ''} onChange={(e) => setFeatureField('CLOUDFLARE_WORKER_URL', e.target.value)} placeholder="https://media.example.com" style={{ fontSize: '0.875rem' }} />
            </div>
          </FeatureSection>

          {/* GitHub */}
          <FeatureSection title="GitHub" description="Required for installing and updating modules and themes.">
            <div className="field">
              <label style={{ fontSize: '0.875rem' }}>GITHUB_API_TOKEN</label>
              <input type="password" autoComplete="off" value={featureFields['GITHUB_API_TOKEN'] ?? ''} onChange={(e) => setFeatureField('GITHUB_API_TOKEN', e.target.value)} placeholder="ghp_…" style={{ fontSize: '0.875rem' }} />
              <span className="field-hint">GitHub → Settings → Developer settings → Personal access tokens (repo read/write)</span>
            </div>
          </FeatureSection>

          {/* Edge Config */}
          <FeatureSection title="Edge Config" description="Enables instant global reads for admin path and site status — recommended for production.">
            <div className="field">
              <label style={{ fontSize: '0.875rem' }}>EDGE_CONFIG</label>
              <input type="password" autoComplete="off" value={featureFields['EDGE_CONFIG'] ?? ''} onChange={(e) => setFeatureField('EDGE_CONFIG', e.target.value)} placeholder="https://edge-config.vercel.com/…" style={{ fontSize: '0.875rem' }} />
            </div>
            <div className="field">
              <label style={{ fontSize: '0.875rem' }}>VERCEL_EDGE_CONFIG_ID</label>
              <input value={featureFields['VERCEL_EDGE_CONFIG_ID'] ?? ''} onChange={(e) => setFeatureField('VERCEL_EDGE_CONFIG_ID', e.target.value)} placeholder="ecfg_…" style={{ fontSize: '0.875rem' }} />
            </div>
          </FeatureSection>

          {/* Bot Protection */}
          <FeatureSection title="Bot Protection (Cloudflare Turnstile)" description="Protects public forms from bots.">
            <div className="field">
              <label style={{ fontSize: '0.875rem' }}>TURNSTILE_SITE_KEY</label>
              <input value={featureFields['TURNSTILE_SITE_KEY'] ?? ''} onChange={(e) => setFeatureField('TURNSTILE_SITE_KEY', e.target.value)} placeholder="Site key" style={{ fontSize: '0.875rem' }} />
            </div>
            <div className="field">
              <label style={{ fontSize: '0.875rem' }}>TURNSTILE_SECRET_KEY</label>
              <input type="password" autoComplete="off" value={featureFields['TURNSTILE_SECRET_KEY'] ?? ''} onChange={(e) => setFeatureField('TURNSTILE_SECRET_KEY', e.target.value)} placeholder="Secret key" style={{ fontSize: '0.875rem' }} />
            </div>
          </FeatureSection>

          {/* Vercel Webhooks */}
          <FeatureSection title="Vercel Deployment Webhooks" description="Enables real-time deployment status for module/theme installs (Vercel Pro/Enterprise only).">
            <div className="field">
              <label style={{ fontSize: '0.875rem' }}>VERCEL_WEBHOOK_SECRET</label>
              <input type="password" autoComplete="off" value={featureFields['VERCEL_WEBHOOK_SECRET'] ?? ''} onChange={(e) => setFeatureField('VERCEL_WEBHOOK_SECRET', e.target.value)} placeholder="Webhook secret from Vercel" style={{ fontSize: '0.875rem' }} />
            </div>
          </FeatureSection>

          {/* Monitoring */}
          <FeatureSection title="Error Monitoring (Sentry)" description="Reports errors to Sentry; logs to Vercel functions if unset.">
            <div className="field">
              <label style={{ fontSize: '0.875rem' }}>SENTRY_DSN</label>
              <input value={featureFields['SENTRY_DSN'] ?? ''} onChange={(e) => setFeatureField('SENTRY_DSN', e.target.value)} placeholder="https://…@sentry.io/…" style={{ fontSize: '0.875rem' }} />
            </div>
          </FeatureSection>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button
              className="btn btn-primary btn-lg"
              style={{ width: '100%' }}
              disabled={featureSaving}
              onClick={() => handleFeatures(false)}
            >
              {featureSaving ? 'Saving…' : 'Save & continue →'}
            </button>
            <button
              className="btn btn-secondary"
              style={{ width: '100%' }}
              disabled={featureSaving}
              onClick={() => handleFeatures(true)}
            >
              Skip — I&apos;ll configure this later
            </button>
          </div>
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

// ── Vercel config panel ────────────────────────────────────────────────────────

function VercelConfigPanel({
  token, setToken,
  neonApiKey, setNeonApiKey,
  projects,
  selectedProjectId, setSelectedProjectId,
  listing,
  error,
  onConnect,
  onConfigure,
}: {
  token: string
  setToken: (v: string) => void
  neonApiKey: string
  setNeonApiKey: (v: string) => void
  projects: VercelProject[]
  selectedProjectId: string
  setSelectedProjectId: (v: string) => void
  listing: boolean
  error: string
  onConnect: () => void
  onConfigure: () => void
}) {
  const hasProjects = projects.length > 0
  const canConfigure = hasProjects && !!selectedProjectId

  return (
    <div>
      <div className="alert alert-info" style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        Cactus needs to connect to your Vercel project to store environment variables and trigger redeployments during setup. No env vars need to be set manually.
      </div>

      <div className="field">
        <label htmlFor="vercelToken">Vercel API token</label>
        <input
          id="vercelToken"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="vcp_… or ve_…"
          disabled={listing}
        />
        <span className="field-hint">
          Create at:{' '}
          <a href="https://vercel.com/account/tokens" target="_blank" rel="noreferrer" style={{ color: '#16a34a' }}>
            Vercel dashboard → Account Settings → Tokens
          </a>
        </span>
      </div>

      <div className="field" style={{ marginBottom: '1rem' }}>
        <label htmlFor="neonApiKey">
          Neon API key <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span>
        </label>
        <input
          id="neonApiKey"
          type="password"
          autoComplete="off"
          value={neonApiKey}
          onChange={(e) => setNeonApiKey(e.target.value)}
          placeholder="napi_…"
          disabled={listing}
        />
        <span className="field-hint">
          Enables automatic database provisioning. Generate at:{' '}
          <a href="https://console.neon.tech/app/settings/api-keys" target="_blank" rel="noreferrer" style={{ color: '#16a34a' }}>
            Neon Console → Account → API Keys
          </a>
        </span>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>{error}</div>
      )}

      {!hasProjects && (
        <button
          className="btn btn-primary"
          style={{ width: '100%', marginBottom: '1rem' }}
          disabled={!token || listing}
          onClick={onConnect}
        >
          {listing ? 'Connecting…' : 'Connect to Vercel →'}
        </button>
      )}

      {hasProjects && (
        <>
          <div className="field">
            <label htmlFor="projectSelect">Select your Vercel project</label>
            <select
              id="projectSelect"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
            >
              <option value="">— choose a project —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.domains.length > 0 ? ` (${p.domains[0]})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              className="btn btn-secondary"
              style={{ flex: 1 }}
              onClick={onConnect}
              disabled={listing}
            >
              {listing ? 'Refreshing…' : '↺ Refresh list'}
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 2 }}
              disabled={!canConfigure}
              onClick={onConfigure}
            >
              Configure project →
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Collapsible feature section ────────────────────────────────────────────────

function FeatureSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: '0.75rem', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          background: open ? '#f0fdf4' : '#f9fafb',
          border: 'none',
          padding: '0.75rem 1rem',
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontFamily: 'inherit',
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{title}</div>
          <div style={{ fontSize: '0.8125rem', color: '#6b7280' }}>{description}</div>
        </div>
        <span style={{ color: '#6b7280', flexShrink: 0, marginLeft: '0.5rem' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '1rem', borderTop: '1px solid #e5e7eb' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ── DB sub-components ──────────────────────────────────────────────────────────

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
          Tip: provide a Neon API key during Vercel configuration to let Cactus create a database automatically.
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
            Continue →
          </button>
        </>
      )}
    </div>
  )
}
