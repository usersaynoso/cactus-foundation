'use client'

import { useState, useEffect, useRef } from 'react'
import type { EnvVarStatus } from '@/lib/config/env'
import type { DatabaseState } from '@/app/api/setup/env-check/route'
import { NEON_REGIONS } from '@/lib/config/neon-regions'
import DeployLogViewer from '@/components/admin/DeployLogViewer'

type Step = 'connect' | 'database' | 'configure'

// Sub-states within the 'env' step.
type DbSubStep =
  | 'loading'              // env-check in flight
  | 'vercel-config'        // VERCEL_API_TOKEN/PROJECT_ID not set → collect them
  | 'vercel-listing'       // fetching project list from Vercel API
  | 'vercel-configuring'   // writing bootstrap env vars to Vercel
  | 'block'                // unexpected required var missing → hard block
  | 'ready'                // all required vars set (DATABASE_URL present)
  | 'db-choice'            // DATABASE_URL absent, NEON_API_KEY present → offer auto or manual
  | 'db-manual'            // DATABASE_URL absent, NEON_API_KEY absent → manual instructions only
  | 'db-provisioning'      // Neon API call in flight
  | 'db-redeploying'       // DATABASE_URL written, waiting for Vercel redeploy + DB reachable
  | 'db-error'             // Neon API call failed — show error + fall back to manual
  | 'db-local'             // local mode, DATABASE_URL absent → show .env.local instructions

type EnvCheckData = {
  required: EnvVarStatus[]
  optional: EnvVarStatus[]
  missingRequired: string[]
  databaseState: DatabaseState
  neonAvailable: boolean
  vercelConfigured: boolean
  localMode: boolean
  siteUrl: string | null
}

type ExistingDbState = {
  setupCompleted: boolean
  adminPath: string | null
  siteName: string | null
  timezone: string | null
  admin: { username: string; email: string } | null
}

type VercelDomain = { name: string; verified: boolean }
type VercelProject = { id: string; name: string; domains: VercelDomain[] }
type DomainChallenge = { type: string; domain: string; value: string; reason: string }

// Two independent things can be outstanding on a domain, and either one stops the
// site serving: `misconfigured` means DNS isn't pointing at Vercel yet, `!verified`
// means Vercel hasn't accepted proof of ownership (the TXT challenge) yet. A domain
// can be pointed correctly and still be unverified, so both are tracked separately.
type DomainState = {
  name: string
  verified: boolean
  verification: DomainChallenge[]
  misconfigured: boolean
  recommended: { type: string; host: string; value: string }
}
type DomainStateResult = { ok: true; state: DomainState } | { ok: false; error: string }

function toDomainState(data: Partial<DomainState>, fallbackName: string): DomainState {
  return {
    name: data.name ?? fallbackName,
    verified: data.verified ?? false,
    verification: data.verification ?? [],
    misconfigured: data.misconfigured ?? true,
    recommended: data.recommended ?? { type: 'A', host: '@', value: '76.76.21.21' },
  }
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

// Polls /api/setup/env-check until vercelConfigured is true, then calls onReady
// with the data from that same response (avoids a second fetch racing the old/new deployment).
// Returns a cancel function.
function startVercelConfiguredPolling(onReady: (data: EnvCheckData) => void): () => void {
  let cancelled = false
  let timer: ReturnType<typeof setTimeout>

  async function poll() {
    if (cancelled) return
    try {
      const res = await fetch('/api/setup/env-check')
      if (res.ok) {
        const data = (await res.json()) as EnvCheckData
        if (data.vercelConfigured) {
          if (!cancelled) onReady(data)
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
  const [step, setStep] = useState<Step>('connect')
  const [envData, setEnvData] = useState<EnvCheckData | null>(null)
  const [dbSubStep, setDbSubStep] = useState<DbSubStep>('loading')
  const [adminPath, setAdminPath] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Database provisioning
  const [neonRegion, setNeonRegion] = useState('aws-us-east-2')
  const [provisionError, setProvisionError] = useState('')
  const [redeployError, setRedeployError] = useState('')
  const [dbReady, setDbReady] = useState(false)
  const [usingExistingData, setUsingExistingData] = useState(false)
  const [adminAlreadyExists, setAdminAlreadyExists] = useState(false)
  const [finalisingDeploy, setFinalisingDeploy] = useState<string | null>(null)
  const [finalisingWarning, setFinalisingWarning] = useState('')
  const cancelPollingRef = useRef<(() => void) | null>(null)
  const cancelDeployLogPollRef = useRef<(() => void) | null>(null)
  // Counter to force re-run the env-check useEffect even when step is already 'env'
  const [envCheckKey, setEnvCheckKey] = useState(0)

  // Deployment progress
  const [deploymentId, setDeploymentId] = useState<string | null>(null)
  const [deployLogs, setDeployLogs] = useState<string[]>([])
  const [deployState, setDeployState] = useState('')

  // Vercel config
  const [vercelToken, setVercelToken] = useState('')
  const [vercelNeonKey, setVercelNeonKey] = useState('')
  const [vercelProjects, setVercelProjects] = useState<VercelProject[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [vercelError, setVercelError] = useState('')
  const [vercelConfiguring, setVercelConfiguring] = useState(false)

  // Account fields
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [userId, setUserId] = useState('')
  const [authMode, setAuthMode] = useState<'passkey' | 'totp'>('passkey')
  const [totpQrDataUrl, setTotpQrDataUrl] = useState('')
  const [totpSecret, setTotpSecret] = useState('')
  const [totpCode, setTotpCode] = useState('')

  // Essentials
  const [siteName, setSiteName] = useState('')
  const [timezone, setTimezone] = useState('UTC')

  // Restore-from-backup (offered on the database step once the DB is connected)
  const restoreInputRef = useRef<HTMLInputElement>(null)
  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState('')
  const [restoreDone, setRestoreDone] = useState(false)

  const steps: Step[] = ['connect', 'database', 'configure']
  const stepIndex = steps.indexOf(step)

  // Clean up health poll and deploy log poll on unmount.
  useEffect(() => {
    return () => {
      cancelPollingRef.current?.()
      cancelDeployLogPollRef.current?.()
    }
  }, [])

  // Set (before any other effect runs, via source order) when the wizard was just
  // redirected here from the pre-redeploy origin after a site-url mismatch - see
  // checkSiteUrlAndRedirectIfNeeded. Consumed once by the Step 2 effect below to
  // skip straight past the "Database connected" click-through to Step 3, since
  // the whole point of that redirect was to land the user on Step 3 immediately.
  const autoContinueRef = useRef(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('autocontinue') !== '1') return
    autoContinueRef.current = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore of pre-redirect intent from the URL on mount; no cascading risk
    if (params.get('existingData') === '1') setUsingExistingData(true)
    params.delete('autocontinue')
    params.delete('existingData')
    const query = params.toString()
    window.history.replaceState({}, '', window.location.pathname + (query ? `?${query}` : ''))
  }, [])

  // ── Step 1: Vercel connection check ───────────────────────────────────────

  useEffect(() => {
    if (step !== 'connect') return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading sub-step indicator before async check; no cascading risk
    setDbSubStep('loading')

    fetch('/api/setup/env-check')
      .then((r) => r.json())
      .then((d: EnvCheckData) => {
        setEnvData(d)

        // Local-development mode: there is no Vercel project to connect, so skip
        // the connect step entirely and go straight to the database step.
        if (d.localMode) {
          setStep('database')
          return
        }

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

        // Vercel is configured — connect step is done, advance immediately
        setStep('database')
      })
      .catch(() => {
        setError('Failed to load environment status')
        setDbSubStep('block')
      })
  // envCheckKey is intentionally included so we can force a re-run after redeploy
  // even when `step` is already 'connect' (React won't re-fire if step value doesn't change)
  }, [step, envCheckKey])

  // ── Step 2: Database check ─────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 'database') return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading sub-step indicator before async check; no cascading risk
    setDbSubStep('loading')

    fetch('/api/setup/env-check')
      .then((r) => r.json())
      .then((d: EnvCheckData) => {
        setEnvData(d)
        if (d.databaseState === 'set') {
          if (autoContinueRef.current) {
            autoContinueRef.current = false
            handleSmartContinue()
          } else {
            setDbSubStep('ready')
          }
        } else if (d.localMode) {
          // Local mode never writes DATABASE_URL or redeploys - the user sets it
          // in .env.local. Show plain instructions rather than the Neon/Vercel panels.
          setDbSubStep('db-local')
        } else if (d.databaseState === 'provisioned-redeploying') {
          // DATABASE_URL is written to Vercel but not in the runtime yet. Don't
          // just sit on a spinner — make sure a redeploy is actually in flight
          // (an earlier trigger may have failed, or the deploy may have errored).
          setDbSubStep('db-redeploying')
          handleEnsureRedeploy(d)
        } else if (d.neonAvailable || !!vercelNeonKey) {
          setDbSubStep('db-choice')
        } else {
          setDbSubStep('db-manual')
        }
      })
      .catch(() => {
        setError('Failed to load database status')
        setDbSubStep('block')
      })
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  function startRedeployPolling() {
    cancelPollingRef.current?.()
    cancelPollingRef.current = startHealthPolling(() => {
      setDbReady(true)
    })
  }

  // Makes sure a redeploy is genuinely running when the wizard lands in the
  // "provisioned, waiting for redeploy" state, and wires up log polling for it.
  // Reuses an in-flight deployment or triggers a fresh one; surfaces failures
  // instead of showing a redeploy that never started.
  async function handleEnsureRedeploy(data?: EnvCheckData) {
    setRedeployError('')
    try {
      const res = await fetch('/api/setup/provision-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ensure-redeploy',
          vercelToken: vercelToken || undefined,
          vercelProjectId: selectedProjectId || undefined,
        }),
      })
      const result = (await res.json()) as {
        status?: string
        error?: string
        deploymentId?: string
        redeployError?: string
      }
      if (result.status === 'already_set') {
        setDbSubStep('ready')
        return
      }
      if (result.status === 'missing') {
        // Nothing provisioned after all — back to the database options.
        const d = data ?? envData
        setDbSubStep(d?.neonAvailable || !!vercelNeonKey ? 'db-choice' : 'db-manual')
        return
      }
      if (!res.ok || result.status === 'error') {
        setProvisionError(result.error ?? 'Failed to check the redeploy status')
        setDbSubStep('db-error')
        return
      }
      if (result.redeployError) {
        setRedeployError(result.redeployError)
      } else if (result.deploymentId) {
        setDeployState('')
        setDeployLogs([])
        setDeploymentId(result.deploymentId)
        cancelDeployLogPollRef.current?.()
        cancelDeployLogPollRef.current = startDeployLogPolling(result.deploymentId, vercelToken)
      }
      startRedeployPolling()
    } catch (err: unknown) {
      setRedeployError(err instanceof Error ? err.message : 'Network error')
      startRedeployPolling()
    }
  }

  function startDeployLogPolling(id: string, token: string): () => void {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    let lastSeen: number | null = null

    async function poll() {
      if (cancelled) return
      try {
        const tokenParam = token ? `&token=${encodeURIComponent(token)}` : ''
        const projectParam = selectedProjectId ? `&projectId=${encodeURIComponent(selectedProjectId)}` : ''
        const url = lastSeen
          ? `/api/setup/deployment-logs?deploymentId=${encodeURIComponent(id)}&since=${lastSeen}${tokenParam}${projectParam}`
          : `/api/setup/deployment-logs?deploymentId=${encodeURIComponent(id)}${tokenParam}${projectParam}`
        const res = await fetch(url)
        if (res.ok) {
          const data = (await res.json()) as { state?: string; logLines?: string[]; latestTimestamp?: number | null }
          if (!cancelled) {
            if (data.state) setDeployState(data.state)
            const lines = data.logLines
            if (lines && lines.length > 0) setDeployLogs(prev => [...prev, ...lines])
            if (data.latestTimestamp) lastSeen = data.latestTimestamp
            // Terminal state: the log stream is finished. Health polling (separate)
            // handles the READY → database-reachable transition.
            if (data.state === 'READY' || data.state === 'ERROR' || data.state === 'CANCELED') {
              cancelled = true
              return
            }
          }
        }
      } catch {
        // ignore — redeploy network errors are expected
      }
      if (!cancelled) timer = setTimeout(poll, 4_000)
    }

    poll()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }

  // Auto-advance from Step 2 once the health check passes.

  useEffect(() => {
    if (dbReady && step === 'database') handleSmartContinue()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- step and handleSmartContinue are stable; only dbReady transition should trigger this
  }, [dbReady])

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
      // Auto-select: prefer the project whose domain matches the current hostname,
      // otherwise fall back to selecting the only project if there's just one.
      const hostname = typeof window !== 'undefined' ? window.location.hostname : ''
      const domainMatch = hostname
        ? projects.find((p) => p.domains.some((d) => d.name === hostname || d.name.endsWith('.' + hostname) || hostname.endsWith('.' + d.name)))
        : undefined
      if (domainMatch) {
        setSelectedProjectId(domainMatch.id)
      } else if (projects.length === 1) {
        setSelectedProjectId(projects[0]?.id ?? '')
      }
    } catch (err: unknown) {
      setVercelError(err instanceof Error ? err.message : 'Network error')
      setDbSubStep('vercel-config')
    }
  }

  async function handleListAccountDomains(): Promise<{ ok: boolean; domains?: VercelDomain[]; error?: string }> {
    try {
      const res = await fetch('/api/setup/vercel-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list-account-domains', token: vercelToken, projectId: selectedProjectId }),
      })
      const data = (await res.json()) as { domains?: VercelDomain[]; error?: string }
      if (!res.ok || data.error) {
        return { ok: false, error: data.error ?? 'Failed to list domains' }
      }
      return { ok: true, domains: data.domains ?? [] }
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : 'Network error' }
    }
  }

  async function handleVercelConfigure(domain?: string) {
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
          domain: domain || undefined,
        }),
      })
      const data = (await res.json()) as {
        status?: string
        siteUrl?: string
        error?: string
      }
      if (!res.ok || data.error) {
        setVercelError(data.error ?? 'Failed to configure project')
        setDbSubStep('vercel-config')
        setVercelConfiguring(false)
        return
      }
      // Vercel is now configured — connect step is complete, advance immediately.
      setStep('database')
    } catch (err: unknown) {
      setVercelError(err instanceof Error ? err.message : 'Network error')
      setDbSubStep('vercel-config')
    } finally {
      setVercelConfiguring(false)
    }
  }

  async function handleAddDomain(projectId: string, domain: string): Promise<DomainStateResult> {
    try {
      const res = await fetch('/api/setup/vercel-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add-domain',
          token: vercelToken,
          projectId,
          domain,
        }),
      })
      const data = (await res.json()) as Partial<DomainState> & { error?: string }
      if (!res.ok || data.error) {
        return { ok: false, error: data.error ?? 'Failed to add domain' }
      }
      const state = toDomainState(data, domain)
      setVercelProjects((prev) =>
        prev.map((p) => {
          if (p.id !== projectId) return p
          const entry: VercelDomain = { name: state.name, verified: state.verified }
          // Vercel treats a re-add of an already-attached domain as a no-op, so this
          // has to update in place rather than blindly appending a duplicate.
          const known = p.domains.some((d) => d.name === state.name)
          return {
            ...p,
            domains: known
              ? p.domains.map((d) => (d.name === state.name ? entry : d))
              : [...p.domains, entry],
          }
        })
      )
      return { ok: true, state }
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : 'Network error' }
    }
  }

  async function handleDomainStatus(projectId: string, domain: string): Promise<DomainStateResult> {
    try {
      const res = await fetch('/api/setup/vercel-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'domain-status', token: vercelToken, projectId, domain }),
      })
      const data = (await res.json()) as Partial<DomainState> & { error?: string }
      if (!res.ok || data.error) {
        return { ok: false, error: data.error ?? 'Failed to check domain status' }
      }
      const state = toDomainState(data, domain)
      setVercelProjects((prev) =>
        prev.map((p) => ({
          ...p,
          domains: p.domains.map((d) => (d.name === state.name ? { ...d, verified: state.verified } : d)),
        }))
      )
      return { ok: true, state }
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : 'Network error' }
    }
  }

  // Shared tail for the provisioning handlers: reads the redeploy outcome off a
  // successful provision-db response and moves the wizard to the redeploying
  // panel — or surfaces a trigger failure so the user isn't shown a redeploy
  // that never started.
  function handleProvisionedResponse(data: { deploymentId?: string; redeployError?: string }) {
    setRedeployError('')
    setDbSubStep('db-redeploying')
    if (data.redeployError) {
      setRedeployError(data.redeployError)
    } else if (data.deploymentId) {
      setDeployState('')
      setDeployLogs([])
      setDeploymentId(data.deploymentId)
      cancelDeployLogPollRef.current?.()
      cancelDeployLogPollRef.current = startDeployLogPolling(data.deploymentId, vercelToken)
    }
    startRedeployPolling()
  }

  async function handleUseExistingNeon(projectId: string, preserveData = false, destroyFirst = false) {
    setUsingExistingData(preserveData)
    setProvisionError('')
    setDbSubStep('db-provisioning')
    try {
      const res = await fetch('/api/setup/provision-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'use-existing',
          projectId,
          destroyData: destroyFirst,
          neonApiKey: vercelNeonKey || undefined,
          vercelToken: vercelToken || undefined,
          vercelProjectId: selectedProjectId || undefined,
        }),
      })
      const data = (await res.json()) as { status?: string; error?: string; deploymentId?: string; redeployError?: string }
      if (!res.ok || data.status === 'error') {
        setProvisionError(data.error ?? 'Failed to configure database')
        setDbSubStep('db-error')
        return
      }
      if (data.status === 'already_set') {
        setDbSubStep('ready')
        return
      }
      handleProvisionedResponse(data)
    } catch (err: unknown) {
      setProvisionError(err instanceof Error ? err.message : 'Network error')
      setDbSubStep('db-error')
    }
  }

  async function handleManualDbSave(url: string) {
    setProvisionError('')
    setDbSubStep('db-provisioning')
    try {
      const res = await fetch('/api/setup/provision-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save-url',
          databaseUrl: url,
          vercelToken: vercelToken || undefined,
          vercelProjectId: selectedProjectId || undefined,
        }),
      })
      const data = (await res.json()) as { status?: string; error?: string; deploymentId?: string; redeployError?: string }
      if (!res.ok || data.status === 'error') {
        setProvisionError(data.error ?? 'Failed to save database URL')
        setDbSubStep('db-error')
        return
      }
      handleProvisionedResponse(data)
    } catch (err: unknown) {
      setProvisionError(err instanceof Error ? err.message : 'Network error')
      setDbSubStep('db-error')
    }
  }

  async function handleProvision() {
    setProvisionError('')
    setDbSubStep('db-provisioning')
    try {
      const res = await fetch('/api/setup/provision-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region: neonRegion,
          neonApiKey: vercelNeonKey || undefined,
          vercelToken: vercelToken || undefined,
          vercelProjectId: selectedProjectId || undefined,
        }),
      })
      const data = (await res.json()) as {
        status?: string
        error?: string
        deploymentId?: string
        redeployError?: string
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

      handleProvisionedResponse(data)
    } catch (err: unknown) {
      setProvisionError(err instanceof Error ? err.message : 'Network error')
      setDbSubStep('db-error')
    }
  }

  // Reads SITE_URL fresh from the server (never process.env.NEXT_PUBLIC_SITE_URL,
  // which is baked into the JS bundle at build time and would still hold the
  // pre-redeploy value in an already-open wizard tab) and, if it doesn't match
  // the current origin, navigates there before Step 3 ever renders on the wrong
  // domain. Passes autocontinue=1 (and existingData=1, if set) so the wizard
  // lands straight on Step 3 instead of Step 2's "Database connected" click-through.
  // Returns true if it navigated away - callers must stop immediately.
  async function checkSiteUrlAndRedirectIfNeeded(): Promise<boolean> {
    try {
      const res = await fetch('/api/setup/env-check')
      const d = (await res.json()) as EnvCheckData
      if (!d.siteUrl) return false
      const expectedOrigin = d.siteUrl.replace(/\/$/, '')
      if (typeof window !== 'undefined' && window.location.origin !== expectedOrigin) {
        const params = new URLSearchParams({ autocontinue: '1' })
        if (usingExistingData) params.set('existingData', '1')
        window.location.replace(`${expectedOrigin}/setup?${params.toString()}`)
        return true
      }
    } catch {
      // Network error — fall through and let the wizard continue on this origin.
    }
    return false
  }

  async function handleRestoreBackup() {
    if (!restoreFile) return
    setRestoring(true)
    setRestoreError('')
    try {
      const body = new FormData()
      body.append('file', restoreFile)
      const res = await fetch('/api/setup/import-backup', { method: 'POST', body })
      if (res.status === 404) throw new Error('Setup is already complete on this site.')
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; loginPath?: string }
        | null
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? 'Restore failed')
      setRestoreDone(true)
      // The backup carries its own admin account and completed-setup flag, so the
      // wizard's work is done - send the owner to their restored login.
      setTimeout(() => { window.location.href = data.loginPath ?? '/' }, 2500)
    } catch (err: unknown) {
      setRestoreError(err instanceof Error ? err.message : 'Restore failed')
    } finally {
      setRestoring(false)
    }
  }

  async function handleSmartContinue() {
    if (await checkSiteUrlAndRedirectIfNeeded()) return
    if (!usingExistingData) {
      setStep('configure')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/setup/read-state', { method: 'POST' })
      const data = (await res.json()) as ExistingDbState

      if (data.setupCompleted && data.adminPath) {
        window.location.href = `/${data.adminPath}`
        return
      }

      if (data.adminPath) setAdminPath(data.adminPath)
      if (data.siteName) setSiteName(data.siteName)
      if (data.timezone) setTimezone(data.timezone)
      if (data.admin) setAdminAlreadyExists(true)

      if (!data.admin) {
        setStep('configure')
      } else if (!data.adminPath || !data.siteName) {
        setStep('configure')
      } else {
        await handleFinish()
      }
    } catch {
      setStep('configure')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 3: Set passkey, save config, complete ────────────────────────────
  useEffect(() => {
    if (step === 'configure') {
      fetch('/api/setup/suggest-path')
        .then((r) => r.json())
        .then((d: { path: string }) => setAdminPath(d.path))
        .catch(() => {})
    }
  }, [step])

  async function handleSetPasskeyAndComplete() {
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
      if (!optRes.ok) {
        const d = await optRes.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error ?? 'Failed to get passkey options')
      }
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

      await handleConfigureOnly()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      // Safari stores passkeys device-side even when server verification fails.
      // On re-setup the stale device credential can cause this obscure error.
      if (msg === 'The string did not match the expected pattern.') {
        setError(
          'Passkey registration failed (Safari conflict). Open Settings → Passwords, find this site, and delete any saved passkey or password entry. If you have multiple Apple devices on the same iCloud account, delete it on all of them. Then return here and try again — or use a different browser (Chrome, Firefox).'
        )
      } else {
        setError(msg)
      }
      setLoading(false)
    }
  }

  async function handleStartTotpSetup() {
    setError('')
    setLoading(true)
    try {
      let uid = userId
      if (!uid) {
        const res = await fetch('/api/setup/create-admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email }),
        })
        if (!res.ok) {
          const d = await res.json()
          throw new Error(d.error ?? 'Failed to create account')
        }
        const data = (await res.json()) as { userId: string }
        uid = data.userId
        setUserId(uid)
      }

      const optRes = await fetch('/api/auth/totp/setup-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid }),
      })
      if (!optRes.ok) {
        const d = await optRes.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error ?? 'Failed to start authenticator setup')
      }
      const opts = (await optRes.json()) as { qrDataUrl: string; secret: string }
      setTotpQrDataUrl(opts.qrDataUrl)
      setTotpSecret(opts.secret)
      setAuthMode('totp')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyTotpAndComplete() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/totp/setup-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, code: totpCode }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Verification failed')
      }
      await handleConfigureOnly()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  async function handleConfigureOnly() {
    try {
      const pathRes = await fetch('/api/setup/set-admin-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPath }),
      })
      if (!pathRes.ok) {
        const d = await pathRes.json()
        throw new Error(d.error ?? 'Invalid admin path')
      }
      const essRes = await fetch('/api/setup/essentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteName, timezone }),
      })
      if (!essRes.ok) {
        const d = await essRes.json()
        throw new Error(d.error ?? 'Failed to save settings')
      }
      await handleFinish()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  async function handleFinish() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/setup/complete', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to complete setup')
      const data = (await res.json()) as { adminPath: string; needsRedeploy?: boolean; redeployError?: string }
      if (data.needsRedeploy) {
        // SESSION_SECRET was just written to Vercel — wait for the redeploy that
        // picks it up, then send the user to the login page.
        setFinalisingDeploy(data.adminPath)
        if (data.redeployError) setFinalisingWarning(data.redeployError)
        setLoading(false)
        cancelPollingRef.current = startHealthPolling(() => {
          window.location.href = `/${data.adminPath}/login`
        })
      } else {
        window.location.href = `/${data.adminPath}`
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const stepLabels: Record<Step, string> = {
    connect: 'Connect',
    database: 'Database',
    configure: 'Configure',
  }

  return (
    <div className="setup-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.75rem' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/cactus.svg" alt="Cactus Foundation" style={{ width: 36, height: 36, background: 'var(--color-primary-subtle)', borderRadius: 8, padding: 3, flexShrink: 0 }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.125rem' }}>Cactus Foundation Setup</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>Step {stepIndex + 1} of {steps.length}</div>
        </div>
      </div>

      {/* Step indicator */}
      <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '2rem' }}>
        {steps.map((s, i) => {
          const isDone = i < stepIndex
          const isActive = i === stepIndex
          return (
            <div key={s} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              {i > 0 && (
                <div style={{
                  position: 'absolute', top: 11, right: '50%', width: '100%',
                  height: 2, background: isDone ? 'var(--color-primary)' : 'var(--color-border)', zIndex: 0,
                }} />
              )}
              <div style={{
                width: 24, height: 24, borderRadius: '50%', zIndex: 1, position: 'relative',
                background: isDone ? 'var(--color-primary)' : isActive ? 'var(--color-bg)' : 'var(--color-bg-subtle)',
                border: `2px solid ${isDone || isActive ? 'var(--color-primary)' : 'var(--color-border)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.6875rem', fontWeight: 700, flexShrink: 0,
                color: isDone ? 'var(--color-on-primary)' : isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
              }}>
                {isDone ? '✓' : i + 1}
              </div>
              <span style={{
                fontSize: '0.625rem', marginTop: '0.3rem', fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--color-success)' : isDone ? 'var(--color-fg)' : 'var(--color-muted)',
                textAlign: 'center', lineHeight: 1.2, whiteSpace: 'nowrap',
              }}>
                {stepLabels[s]}
              </span>
            </div>
          )
        })}
      </div>

      {error && <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>{error}</div>}

      {finalisingDeploy ? (
        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
            <span className="setup-spinner" style={{ width: 28, height: 28 }} />
          </div>
          <p style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '1.0625rem' }}>Almost there!</p>
          <p style={{ color: 'var(--color-muted)', fontSize: '0.9375rem', margin: 0 }}>
            Vercel is applying the final configuration. You&apos;ll be redirected to
            your login page automatically once the deployment is ready.
          </p>
          {finalisingWarning && (
            <div className="alert alert-warning" style={{ marginTop: '1rem', textAlign: 'left', fontSize: '0.875rem' }}>
              <strong>The automatic redeploy could not be started.</strong>
              <div style={{ fontSize: '0.8125rem', marginTop: '0.25rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>{finalisingWarning}</div>
              <div style={{ marginTop: '0.5rem' }}>
                Trigger a redeploy from the Vercel dashboard (Deployments → ⋯ → Redeploy) — this page
                will continue automatically once it finishes.
              </div>
            </div>
          )}
        </div>
      ) : (
      <>

      {/* ── Step: CONNECT ── */}
      {step === 'connect' && (
        <div>
          <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.25rem' }}>Connect your project</h2>
          <p style={{ color: 'var(--color-muted)', fontSize: '0.9375rem', margin: '0 0 1.5rem' }}>
            Link Cactus Foundation to your Vercel project — no environment variables need to be set manually.
          </p>

          {dbSubStep === 'loading' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', color: 'var(--color-muted)', fontSize: '0.9375rem' }}>
              <span className="setup-spinner" />
              Checking…
            </div>
          )}

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
              onAddDomain={handleAddDomain}
              onDomainStatus={handleDomainStatus}
              onListAccountDomains={handleListAccountDomains}
            />
          )}

          {/* ── Writing Vercel env vars ── */}
          {dbSubStep === 'vercel-configuring' && (
            <div className="alert alert-info" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span className="setup-spinner" />
              <span>Writing environment variables to your Vercel project…</span>
            </div>
          )}

          {/* Hard block */}
          {dbSubStep === 'block' && envData && (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem' }}>Required</div>
                {envData.required.map((v) => {
                  if (v.name === 'DATABASE_URL') return null
                  return (
                    <div key={v.name} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <span style={{ color: v.set ? 'var(--color-success)' : 'var(--color-destructive)', fontWeight: 700, flexShrink: 0 }}>{v.set ? '✓' : '✗'}</span>
                      <div>
                        <code style={{ fontFamily: 'monospace', fontSize: 'var(--text-sm)' }}>{v.name}</code>
                        {!v.set && (
                          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-destructive)' }}>{v.description}</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="alert alert-danger">
                Unexpected missing variables:{' '}
                <strong>
                  {envData.missingRequired
                    .filter((v) => v !== 'DATABASE_URL' && v !== 'VERCEL_API_TOKEN' && v !== 'VERCEL_PROJECT_ID')
                    .join(', ')}
                </strong>.
                Add them to your Vercel project environment variables and redeploy.
              </div>
            </>
          )}

        </div>
      )}

      {/* ── Step: DATABASE ── */}
      {step === 'database' && (
        <div>
          <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.25rem' }}>Set up your database</h2>
          <p style={{ color: 'var(--color-muted)', fontSize: '0.9375rem', margin: '0 0 1.5rem' }}>
            Cactus Foundation needs a PostgreSQL database to store your content.
          </p>

          {dbSubStep === 'loading' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', color: 'var(--color-muted)', fontSize: '0.9375rem' }}>
              <span className="setup-spinner" />
              Checking…
            </div>
          )}

          {dbSubStep === 'ready' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '1.5rem', color: 'var(--color-success)' }}>✓</span>
                <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Database connected</h2>
              </div>
              <p style={{ color: 'var(--color-muted)', fontSize: '0.9375rem', margin: '0 0 1.5rem' }}>
                {envData?.localMode
                  ? 'Connected to the database in your .env.local and the schema is ready.'
                  : 'The redeploy is complete and the schema is ready.'}
              </p>
              <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={() => handleSmartContinue()}>
                Continue →
              </button>

              <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '1.5rem 0' }} />

              <div>
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '0.25rem' }}>Restoring from a backup?</h3>
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', margin: '0 0 0.75rem' }}>
                  If you have a Cactus backup file from another site, you can import it here to skip the rest of setup entirely.
                </p>
                <input
                  ref={restoreInputRef}
                  type="file"
                  accept=".sql,application/sql,text/plain"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    setRestoreFile(e.target.files?.[0] ?? null)
                    setRestoreError('')
                  }}
                />
                {restoreError && (
                  <div className="alert alert-danger" style={{ marginBottom: '0.75rem', fontSize: '0.875rem' }}>{restoreError}</div>
                )}
                {restoreDone ? (
                  <div className="alert alert-info" style={{ marginBottom: '0.5rem' }}>
                    Backup restored. Taking you to your login…
                  </div>
                ) : !restoreFile ? (
                  <button className="btn btn-secondary" style={{ fontSize: '0.875rem' }} onClick={() => restoreInputRef.current?.click()}>
                    Choose backup file…
                  </button>
                ) : (
                  <div className="card" style={{ borderColor: 'var(--color-destructive)', padding: '1rem' }}>
                    <p style={{ fontSize: '0.875rem', margin: '0 0 0.5rem' }}>
                      Restore from <strong>{restoreFile.name}</strong>?
                    </p>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', margin: '0 0 0.75rem' }}>
                      This replaces the empty database with the backup&apos;s contents and finishes setup for you.
                    </p>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <button className="btn btn-primary" disabled={restoring} onClick={handleRestoreBackup}>
                        {restoring ? 'Restoring…' : 'Restore backup'}
                      </button>
                      <button
                        className="btn btn-secondary"
                        disabled={restoring}
                        onClick={() => {
                          setRestoreFile(null)
                          setRestoreError('')
                          if (restoreInputRef.current) restoreInputRef.current.value = ''
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {dbSubStep === 'db-local' && (
            <div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                <span style={{ color: 'var(--color-danger)', fontWeight: 700, flexShrink: 0 }}>✗</span>
                <div>
                  <code style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>DATABASE_URL</code>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>Not set in your local environment.</div>
                </div>
              </div>
              <div className="alert alert-info" style={{ fontSize: '0.875rem' }}>
                <p style={{ margin: '0 0 0.5rem' }}>
                  You&apos;re running Cactus Foundation in local-development mode. Add your
                  database connection string to <code>.env.local</code>, apply the schema,
                  then restart the dev server:
                </p>
                <pre style={{ margin: '0 0 0.5rem', padding: '0.625rem 0.75rem', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: '0.8125rem', overflowX: 'auto' }}>
{`# .env.local
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require

npm run db:migrate
npm run dev`}
                </pre>
                <p style={{ margin: 0 }}>
                  Then reload this page - setup will continue from here.
                </p>
              </div>
            </div>
          )}

          {dbSubStep === 'db-choice' && (
            <DbChoicePanel
              neonRegion={neonRegion}
              setNeonRegion={setNeonRegion}
              onProvision={handleProvision}
              onUseExisting={(id) => handleUseExistingNeon(id, false)}
              onDestroyExisting={(id) => handleUseExistingNeon(id, false, true)}
              onUseExistingWithData={(id) => handleUseExistingNeon(id, true)}
              onSaveManualUrl={handleManualDbSave}
              neonApiKey={vercelNeonKey}
            />
          )}

          {dbSubStep === 'db-manual' && (
            <DbManualPanel
              onSaveUrl={handleManualDbSave}
            />
          )}

          {dbSubStep === 'db-provisioning' && (
            <div>
              <div className="alert alert-info" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span className="setup-spinner" style={{ flexShrink: 0 }} />
                <span>Configuring database… this usually takes a few seconds.</span>
              </div>
            </div>
          )}

          {dbSubStep === 'db-redeploying' && (
            <DbRedeployingPanel
              deployState={deployState}
              deployLogs={deployLogs}
              deploymentId={deploymentId}
              redeployError={redeployError}
              onRetryRedeploy={() => handleEnsureRedeploy()}
            />
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
                onSaveUrl={handleManualDbSave}
                onBack={envData?.neonAvailable ? () => setDbSubStep('db-choice') : undefined}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Step: CONFIGURE (merged account + configure) ── */}
      {step === 'configure' && (
        <div>
          <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.25rem' }}>Set up your site</h2>
          <p style={{ color: 'var(--color-muted)', fontSize: '0.9375rem', margin: '0 0 1.5rem' }}>
            {adminAlreadyExists
              ? 'An admin account already exists — just configure your site below.'
              : 'Name your site and create your admin account.'}
          </p>

          {adminAlreadyExists && (
            <div className="alert alert-info" style={{ marginBottom: '1.5rem', fontSize: '0.875rem' }}>
              <strong>Using existing admin account.</strong> Passkey registration is not required.
            </div>
          )}

          <div className="field">
            <label htmlFor="siteName">Site name</label>
            <input id="siteName" value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="My Cactus Foundation Site" />
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
          <div className="field">
            <label htmlFor="adminPath">Admin path</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <span style={{ padding: '0.5rem 0.75rem', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: '0.9375rem', color: 'var(--color-muted)', flexShrink: 0 }}>
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
            <span className="field-hint">Lowercase letters, numbers, and hyphens only. Anyone who doesn&apos;t know it gets a plain 404.</span>
          </div>

          {!adminAlreadyExists && (
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
            </>
          )}

          {!adminAlreadyExists && authMode === 'totp' ? (
            <div>
              <div style={{ background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '1rem', textAlign: 'center' }}>
                {totpQrDataUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- data: URL from our own qrcode render, not an optimizable remote asset
                  <img src={totpQrDataUrl} alt="Authenticator app QR code" style={{ width: 180, height: 180, margin: '0 auto', display: 'block' }} />
                )}
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', margin: '0.75rem 0 0.25rem' }}>
                  Scan with Google Authenticator, Authy, 1Password, or similar. Can&apos;t scan? Enter this key manually:
                </p>
                <code style={{ fontSize: '0.8125rem', wordBreak: 'break-all' }}>{totpSecret}</code>
              </div>
              <div className="field" style={{ marginTop: '1rem' }}>
                <label htmlFor="totpCode">Enter the 6-digit code</label>
                <input
                  id="totpCode"
                  inputMode="numeric"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                />
              </div>
              <button
                className="btn btn-primary btn-lg"
                style={{ width: '100%' }}
                disabled={loading || totpCode.length !== 6}
                onClick={handleVerifyTotpAndComplete}
              >
                {loading ? 'Verifying…' : 'Verify and complete →'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: '100%', marginTop: '0.5rem' }}
                onClick={() => { setAuthMode('passkey'); setError('') }}
              >
                ← Back to passkey
              </button>
            </div>
          ) : (
            <>
              <button
                className="btn btn-primary btn-lg"
                style={{ width: '100%' }}
                disabled={
                  !siteName || !adminPath || loading ||
                  (!adminAlreadyExists && (!username || !email))
                }
                onClick={adminAlreadyExists ? () => { setLoading(true); handleConfigureOnly() } : handleSetPasskeyAndComplete}
              >
                {loading
                  ? 'Setting up…'
                  : adminAlreadyExists
                    ? 'Complete setup →'
                    : 'Set passkey →'}
              </button>
              {!adminAlreadyExists && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: '100%', marginTop: '0.5rem' }}
                  disabled={loading || !siteName || !adminPath || !username || !email}
                  onClick={handleStartTotpSetup}
                >
                  Use Token instead of Passkeys
                </button>
              )}
            </>
          )}
        </div>
      )}

      </>
      )}

      <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
        <div style={{ fontStyle: 'italic', marginBottom: '0.375rem' }}>Tough on the outside. Thrives on neglect. Refuses to die.</div>
        v{process.env.NEXT_PUBLIC_APP_VERSION}
      </div>
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
  onAddDomain,
  onDomainStatus,
  onListAccountDomains,
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
  onConfigure: (domain?: string) => void
  onAddDomain: (projectId: string, domain: string) => Promise<DomainStateResult>
  onDomainStatus: (projectId: string, domain: string) => Promise<DomainStateResult>
  onListAccountDomains: () => Promise<{ ok: boolean; domains?: VercelDomain[]; error?: string }>
}) {
  const hasProjects = projects.length > 0
  const selectedProject = projects.find((p) => p.id === selectedProjectId)

  const [selectedDomain, setSelectedDomain] = useState('')
  const [showAddDomain, setShowAddDomain] = useState(false)
  const [newDomain, setNewDomain] = useState('')
  const [addingDomain, setAddingDomain] = useState(false)
  const [attachingDomain, setAttachingDomain] = useState<string | null>(null)
  const [domainAddError, setDomainAddError] = useState('')
  const [domainState, setDomainState] = useState<DomainState | null>(null)
  const [checkingStatus, setCheckingStatus] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [statusError, setStatusError] = useState('')
  const [accountDomains, setAccountDomains] = useState<VercelDomain[]>([])
  const [loadingAccountDomains, setLoadingAccountDomains] = useState(false)
  const [accountDomainsError, setAccountDomainsError] = useState('')

  // Guards against a slow status check for a domain the user has since switched away
  // from landing on top of the current one.
  const statusRequestRef = useRef(0)

  async function refreshDomainState(domain: string): Promise<DomainState | null> {
    if (!selectedProjectId || !domain) return null
    const seq = ++statusRequestRef.current
    setCheckingStatus(true)
    const result = await onDomainStatus(selectedProjectId, domain)
    if (seq !== statusRequestRef.current) return null
    setCheckingStatus(false)
    if (!result.ok) {
      setStatusError(result.error)
      return null
    }
    setStatusError('')
    setDomainState(result.state)
    return result.state
  }

  function selectDomain(domain: string) {
    statusRequestRef.current++
    setSelectedDomain(domain)
    setDomainState(null)
    setStatusMessage('')
    setStatusError('')
    void refreshDomainState(domain)
  }

  // Default to a non-vercel.app domain if one exists, otherwise the vercel.app alias.
  // Also eagerly loads the account's full domain list so any domain already bought
  // or attached elsewhere shows up right away, not just after clicking "add".
  useEffect(() => {
    statusRequestRef.current++
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets domain choice and its status to match the newly selected project; no cascading risk
    setDomainState(null)
    setStatusMessage('')
    setStatusError('')
    if (!selectedProject) {
      setSelectedDomain('')
      return
    }
    const custom = selectedProject.domains.find((d) => !d.name.endsWith('.vercel.app'))
    const fallback = selectedProject.domains.find((d) => d.name.endsWith('.vercel.app'))
    const initial = custom ?? fallback
    setSelectedDomain(initial?.name ?? '')
    setShowAddDomain(false)
    setNewDomain('')
    setDomainAddError('')
    setAccountDomains([])
    setAccountDomainsError('')
    setLoadingAccountDomains(true)
    onListAccountDomains().then((result) => {
      setLoadingAccountDomains(false)
      if (!result.ok) {
        setAccountDomainsError(result.error ?? 'Failed to list account domains')
        return
      }
      setAccountDomains(result.domains ?? [])
    })
    // A domain already attached to the project can still be waiting on its ownership
    // TXT record, so read its real state rather than trusting the list's flag.
    if (initial) void refreshDomainState(initial.name)
  }, [selectedProjectId]) // eslint-disable-line react-hooks/exhaustive-deps

  // No optimistic fallback: until Vercel itself has told us the domain is both owned and
  // pointing here, it is not ready. SITE_URL becomes the WebAuthn relying-party ID and
  // cannot be changed once a passkey exists, so a domain that never resolves must not be
  // allowed to reach the account step. An unread or failed check counts as not ready.
  const domainReady = !!domainState && domainState.verified && !domainState.misconfigured
  const domainPending = !!selectedDomain && !domainReady

  const canConfigure = hasProjects && !!selectedProjectId && !!selectedDomain && domainReady
  const attachedNames = new Set(selectedProject?.domains.map((d) => d.name) ?? [])
  const unattachedAccountDomains = accountDomains.filter((d) => !attachedNames.has(d.name))

  // Every record the user still has to add: the A/CNAME only while DNS isn't pointing
  // here, plus any ownership challenge Vercel is waiting on. The two are independent -
  // a domain registered under someone else's Vercel account can point at us perfectly
  // and still refuse to serve until the TXT record proves it's ours.
  const pendingRecords = domainState
    ? [
        ...(domainState.misconfigured ? [domainState.recommended] : []),
        ...(domainState.verified
          ? []
          : domainState.verification.map((v) => ({ type: v.type, host: v.domain, value: v.value }))),
      ]
    : []
  const ownershipPending = !!domainState && !domainState.verified

  // Auto-checks every 10s while anything is outstanding, so the user isn't forced to
  // keep clicking "Check now" - the Configure button unlocks itself once it clears.
  useEffect(() => {
    if (!domainPending || !selectedDomain) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    async function poll() {
      if (cancelled) return
      const state = await refreshDomainState(selectedDomain)
      if (cancelled) return
      if (state && state.verified && !state.misconfigured) {
        setStatusMessage('Domain is set up correctly.')
        return
      }
      timer = setTimeout(poll, 10_000)
    }

    timer = setTimeout(poll, 10_000)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [domainPending, selectedDomain]) // eslint-disable-line react-hooks/exhaustive-deps

  function applyAddedDomain(state: DomainState) {
    statusRequestRef.current++
    setSelectedDomain(state.name)
    setDomainState(state)
    setStatusMessage('')
    setStatusError('')
  }

  async function handleAttachClick(domainName: string) {
    if (!selectedProjectId) return
    setAttachingDomain(domainName)
    setDomainAddError('')
    const result = await onAddDomain(selectedProjectId, domainName)
    setAttachingDomain(null)
    if (!result.ok) {
      setDomainAddError(result.error)
      return
    }
    setAccountDomains((prev) => prev.filter((d) => d.name !== domainName))
    applyAddedDomain(result.state)
  }

  async function handleAddDomainClick() {
    const domain = newDomain.trim()
    if (!domain || !selectedProjectId) return
    setAddingDomain(true)
    setDomainAddError('')
    const result = await onAddDomain(selectedProjectId, domain)
    setAddingDomain(false)
    if (!result.ok) {
      setDomainAddError(result.error)
      return
    }
    setShowAddDomain(false)
    setNewDomain('')
    applyAddedDomain(result.state)
  }

  async function handleCheckStatus() {
    if (!selectedDomain) return
    setStatusMessage('')
    const state = await refreshDomainState(selectedDomain)
    if (!state) return
    if (state.verified && !state.misconfigured) {
      setStatusMessage('Domain is set up correctly.')
    } else {
      setStatusMessage('Not seeing the records yet - DNS changes can take a while to spread. Try again shortly.')
    }
  }

  return (
    <div>
      <div className="alert alert-info" style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        Cactus Foundation needs to connect to your Vercel project to store environment variables and trigger redeployments during setup. No env vars need to be set manually.
      </div>

      <div className="field">
        <label htmlFor="vercelToken">Vercel API token</label>
        <input
          id="vercelToken"
          type="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          value={token}
          onChange={(e) => setToken(e.target.value.trim())}
          placeholder="vcp_… or ve_…"
          disabled={listing}
          style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
        />
        <span className="field-hint">
          Create at:{' '}
          <a href="https://vercel.com/account/tokens" target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)' }}>
            Vercel dashboard → Account Settings → Tokens
          </a>
        </span>
      </div>

      <div className="field" style={{ marginBottom: '1rem' }}>
        <label htmlFor="neonApiKey">
          Neon API key <span style={{ color: 'var(--color-muted)', fontWeight: 400 }}>(optional)</span>
        </label>
        <input
          id="neonApiKey"
          type="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          value={neonApiKey}
          onChange={(e) => setNeonApiKey(e.target.value.trim())}
          placeholder="napi_…"
          disabled={listing}
          style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
        />
        <span className="field-hint">
          Enables automatic database provisioning. Generate at:{' '}
          <a href="https://console.neon.tech/app/settings/api-keys" target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)' }}>
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
                  {p.name}{p.domains.length > 0 ? ` (${p.domains[0]?.name})` : ''}
                </option>
              ))}
            </select>
          </div>

          {selectedProject && (
            <div className="field">
              <label>Domain</label>
              {selectedProject.domains.length === 0 && (
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', marginBottom: '0.5rem' }}>
                  No domain is assigned to this project yet.
                </div>
              )}
              {selectedProject.domains.map((d) => (
                <label key={d.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 400, fontSize: '0.9375rem', marginBottom: '0.375rem' }}>
                  <input
                    type="radio"
                    name="domainChoice"
                    checked={selectedDomain === d.name}
                    onChange={() => selectDomain(d.name)}
                  />
                  {d.name}
                  {!d.verified && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-danger)' }}>(unverified)</span>
                  )}
                </label>
              ))}

              {loadingAccountDomains && (
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', margin: '0.5rem 0' }}>
                  Checking your Vercel account for other domains…
                </div>
              )}
              {accountDomainsError && (
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-danger)', margin: '0.5rem 0' }}>{accountDomainsError}</div>
              )}
              {unattachedAccountDomains.length > 0 && (
                <div style={{ margin: '0.5rem 0' }}>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', marginBottom: '0.375rem' }}>
                    Also in your Vercel account:
                  </div>
                  {unattachedAccountDomains.map((d) => (
                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span style={{ fontSize: '0.9375rem' }}>{d.name}</span>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={attachingDomain !== null}
                        onClick={() => handleAttachClick(d.name)}
                      >
                        {attachingDomain === d.name ? 'Attaching…' : 'Attach'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {!showAddDomain && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ marginTop: '0.375rem' }}
                  onClick={() => setShowAddDomain(true)}
                >
                  + Add a new domain
                </button>
              )}

              {showAddDomain && (
                <div style={{ marginTop: '0.5rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      value={newDomain}
                      onChange={(e) => setNewDomain(e.target.value.trim())}
                      placeholder="yourdomain.com"
                      disabled={addingDomain}
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={!newDomain || addingDomain}
                      onClick={handleAddDomainClick}
                    >
                      {addingDomain ? 'Adding…' : 'Add'}
                    </button>
                  </div>
                  {domainAddError && (
                    <div className="alert alert-danger" style={{ marginTop: '0.5rem', fontSize: '0.8125rem' }}>{domainAddError}</div>
                  )}
                </div>
              )}

              {domainPending && (
                <div className="alert alert-info" style={{ marginTop: '0.5rem', fontSize: '0.8125rem' }}>
                  {!domainState ? (
                    <div>
                      {statusError
                        ? `Could not check ${selectedDomain} with Vercel, so it cannot be used yet.`
                        : `Checking what ${selectedDomain} needs…`}
                    </div>
                  ) : (
                    <>
                      <strong>
                        {domainState.misconfigured && ownershipPending
                          ? 'This domain needs two things before it will work.'
                          : domainState.misconfigured
                            ? 'Domain added, but it is not pointing here yet.'
                            : 'Domain added, but Vercel needs proof that it is yours.'}
                      </strong>{' '}
                      {pendingRecords.length > 0 ? (
                        <>
                          At your DNS provider, add {pendingRecords.length === 1 ? 'this record' : 'these records'}:
                          <table style={{ width: '100%', marginTop: '0.5rem', fontFamily: 'monospace', fontSize: '0.8125rem', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ textAlign: 'left', color: 'var(--color-muted)' }}>
                                <th style={{ paddingRight: '0.75rem' }}>Type</th>
                                <th style={{ paddingRight: '0.75rem' }}>Name</th>
                                <th>Value</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pendingRecords.map((r, i) => (
                                <tr key={`${r.type}-${r.host}-${i}`}>
                                  <td style={{ paddingRight: '0.75rem' }}>{r.type}</td>
                                  <td style={{ paddingRight: '0.75rem' }}>{r.host}</td>
                                  <td style={{ wordBreak: 'break-all' }}>{r.value}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </>
                      ) : (
                        <>Vercel has not said which records it wants, so open the domain in your Vercel dashboard and follow the steps there.</>
                      )}
                      {ownershipPending && (
                        <div style={{ marginTop: '0.5rem', color: 'var(--color-muted)' }}>
                          Vercel has seen this domain registered under another account, so the verification record is how you prove it is yours. Every record above is needed.
                        </div>
                      )}
                      <div style={{ marginTop: '0.5rem' }}>
                        Alternative: point the domain&apos;s nameservers at Vercel instead (<code>ns1.vercel-dns.com</code>, <code>ns2.vercel-dns.com</code>) and skip the records above.
                      </div>
                    </>
                  )}
                  <div style={{ marginTop: '0.5rem', color: 'var(--color-muted)' }}>
                    This checks itself every few seconds - the Configure button unlocks as soon as it clears.
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ marginTop: '0.625rem' }}
                    onClick={handleCheckStatus}
                    disabled={checkingStatus}
                  >
                    {checkingStatus ? 'Checking…' : 'Check now'}
                  </button>
                  {statusError && (
                    <div style={{ marginTop: '0.375rem', color: 'var(--color-danger)' }}>{statusError}</div>
                  )}
                  {statusMessage && (
                    <div style={{ marginTop: '0.375rem' }}>{statusMessage}</div>
                  )}
                </div>
              )}

              {domainReady && statusMessage && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.8125rem', color: 'var(--color-success)' }}>
                  {statusMessage}
                </div>
              )}
            </div>
          )}

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
              onClick={() => onConfigure(selectedDomain)}
            >
              Configure project →
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── DB sub-components ──────────────────────────────────────────────────────────

function DbChoicePanel({
  neonRegion,
  setNeonRegion,
  onProvision,
  onUseExisting,
  onDestroyExisting,
  onUseExistingWithData,
  onSaveManualUrl,
  neonApiKey,
}: {
  neonRegion: string
  setNeonRegion: (r: string) => void
  onProvision: () => void
  onUseExisting: (projectId: string) => void
  onDestroyExisting: (projectId: string) => void
  onUseExistingWithData: (projectId: string) => void
  onSaveManualUrl: (url: string) => void
  neonApiKey: string
}) {
  const [selectedOption, setSelectedOption] = useState<null | 'create' | 'existing' | 'manual'>(null)
  const [neonProjects, setNeonProjects] = useState<{ id: string; name: string }[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [projectsError, setProjectsError] = useState('')
  const [manualDbUrl, setManualDbUrl] = useState('')
  const [checkingExistingData, setCheckingExistingData] = useState(false)
  const [existingDataWarning, setExistingDataWarning] = useState(false)
  const [pendingProjectId, setPendingProjectId] = useState('')

  async function handleSelectExisting() {
    if (selectedOption === 'existing') {
      setSelectedOption(null)
      return
    }
    setSelectedOption('existing')
    setLoadingProjects(true)
    setProjectsError('')
    setNeonProjects([])
    setSelectedProjectId('')
    setExistingDataWarning(false)
    setPendingProjectId('')
    try {
      const res = await fetch('/api/setup/provision-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list', neonApiKey: neonApiKey || undefined }),
      })
      const data = (await res.json()) as { projects?: { id: string; name: string }[]; error?: string }
      if (!res.ok || data.error) {
        setProjectsError(data.error ?? 'Failed to list Neon projects')
        return
      }
      setNeonProjects(data.projects ?? [])
    } catch (err: unknown) {
      setProjectsError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setLoadingProjects(false)
    }
  }

  async function handleUseProjectClick(projectId: string) {
    setExistingDataWarning(false)
    setPendingProjectId(projectId)
    setCheckingExistingData(true)
    try {
      const res = await fetch('/api/setup/provision-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check-existing', projectId, neonApiKey: neonApiKey || undefined }),
      })
      const data = (await res.json()) as { hasExistingData?: boolean }
      if (data.hasExistingData) {
        setExistingDataWarning(true)
        return
      }
      onUseExisting(projectId)
    } catch {
      // If check fails, proceed anyway
      onUseExisting(projectId)
    } finally {
      setCheckingExistingData(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
        <span style={{ color: 'var(--color-danger)', fontWeight: 700, flexShrink: 0 }}>✗</span>
        <div>
          <code style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>DATABASE_URL</code>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>No database connected yet — choose an option below.</div>
        </div>
      </div>

      {/* Create a fresh database */}
      <div style={{ border: selectedOption === 'create' ? '2px solid var(--color-primary)' : '1px solid var(--color-success-border)', borderRadius: 8, marginBottom: '0.75rem', overflow: 'hidden' }}>
        <button
          onClick={() => setSelectedOption(selectedOption === 'create' ? null : 'create')}
          style={{ width: '100%', background: selectedOption === 'create' ? 'var(--color-success-subtle)' : 'var(--color-bg-subtle)', border: 'none', padding: '0.875rem 1rem', textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'inherit' }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 'var(--text-base)', color: 'var(--color-success)' }}>Create a fresh database automatically</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>Cactus Foundation creates a free Neon Postgres database and configures it for you.</div>
          </div>
          <span style={{ color: 'var(--color-muted)', flexShrink: 0, marginLeft: '0.5rem' }}>{selectedOption === 'create' ? '▲' : '▼'}</span>
        </button>
        {selectedOption === 'create' && (
          <div style={{ padding: '1rem', borderTop: '1px solid var(--color-success-border)', background: 'var(--color-success-subtle)' }}>
            <div className="field" style={{ marginBottom: '0.75rem' }}>
              <label htmlFor="neonRegion" style={{ fontSize: '0.875rem' }}>Database region</label>
              <select id="neonRegion" value={neonRegion} onChange={(e) => setNeonRegion(e.target.value)} style={{ fontSize: '0.875rem' }}>
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
        )}
      </div>

      {/* Use an existing Neon database */}
      <div style={{ border: selectedOption === 'existing' ? '2px solid var(--color-info)' : '1px solid var(--color-info-border)', borderRadius: 8, marginBottom: '0.75rem', overflow: 'hidden' }}>
        <button
          onClick={handleSelectExisting}
          style={{ width: '100%', background: selectedOption === 'existing' ? 'var(--color-info-subtle)' : 'var(--color-bg-subtle)', border: 'none', padding: '0.875rem 1rem', textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'inherit' }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 'var(--text-base)', color: 'var(--color-info)' }}>Use an existing Neon database</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>Connect an existing Neon project from your account.</div>
          </div>
          <span style={{ color: 'var(--color-muted)', flexShrink: 0, marginLeft: '0.5rem' }}>{selectedOption === 'existing' ? '▲' : '▼'}</span>
        </button>
        {selectedOption === 'existing' && (
          <div style={{ padding: '1rem', borderTop: '1px solid var(--color-info-border)', background: 'var(--color-info-subtle)' }}>
            {loadingProjects && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', color: 'var(--color-muted)', marginBottom: '1rem' }}>
                <span className="setup-spinner" />
                Loading your Neon projects…
              </div>
            )}
            {projectsError && (
              <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>{projectsError}</div>
            )}
            {!loadingProjects && !projectsError && neonProjects.length === 0 && (
              <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>No Neon projects found in your account.</div>
            )}
            {neonProjects.length === 1 && (
              <div style={{ marginBottom: '1rem', fontSize: '0.875rem', color: 'var(--color-fg)' }}>
                Project: <strong>{neonProjects[0]?.name}</strong>
                <span className="field-hint" style={{ display: 'block' }}>Cactus Foundation will read the default branch connection URI and write it to Vercel.</span>
              </div>
            )}
            {neonProjects.length > 1 && (
              <div className="field" style={{ marginBottom: '1rem' }}>
                <label htmlFor="neonProjectSelect" style={{ fontSize: '0.875rem' }}>Neon project</label>
                <select
                  id="neonProjectSelect"
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  style={{ fontSize: '0.875rem' }}
                >
                  <option value="">— choose a project —</option>
                  {neonProjects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <span className="field-hint">Cactus Foundation will read the default branch connection URI and write it to Vercel.</span>
              </div>
            )}
            {neonProjects.length > 0 && !existingDataWarning && (
              <button
                className="btn btn-primary"
                style={{ width: '100%' }}
                disabled={(neonProjects.length > 1 && !selectedProjectId) || checkingExistingData}
                onClick={() => handleUseProjectClick(neonProjects.length === 1 ? (neonProjects[0]?.id ?? '') : selectedProjectId)}
              >
                {checkingExistingData ? (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                    <span className="setup-spinner" />
                    Checking for existing data…
                  </span>
                ) : 'Use this project →'}
              </button>
            )}
            {existingDataWarning && (
              <div style={{ marginTop: '0.5rem' }}>
                <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
                  <strong>⚠ This project already contains data.</strong>
                  <div style={{ fontSize: '0.8125rem', marginTop: '0.375rem' }}>
                    This Neon project has existing tables. How do you want to proceed?
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <button
                    className="btn btn-primary"
                    style={{ width: '100%' }}
                    onClick={() => { setExistingDataWarning(false); onUseExistingWithData(pendingProjectId) }}
                  >
                    Use existing data →
                  </button>
                  <button
                    className="btn btn-danger"
                    style={{ width: '100%' }}
                    onClick={() => { setExistingDataWarning(false); onDestroyExisting(pendingProjectId) }}
                  >
                    Destroy all existing data
                  </button>
                  <button
                    className="btn"
                    style={{ width: '100%', background: 'var(--color-bg)', border: '1px solid var(--color-border)', fontSize: '0.875rem' }}
                    onClick={() => { setExistingDataWarning(false); setPendingProjectId('') }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Supply own DATABASE_URL */}
      <div style={{ border: selectedOption === 'manual' ? '2px solid var(--color-muted)' : '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
        <button
          onClick={() => setSelectedOption(selectedOption === 'manual' ? null : 'manual')}
          style={{ width: '100%', background: 'var(--color-bg-subtle)', border: 'none', padding: '0.875rem 1rem', textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'inherit' }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>I&apos;ll supply my own DATABASE_URL</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>Paste a PostgreSQL connection string — Cactus Foundation saves it to Vercel and redeploys.</div>
          </div>
          <span style={{ color: 'var(--color-muted)', flexShrink: 0, marginLeft: '0.5rem' }}>{selectedOption === 'manual' ? '▲' : '▼'}</span>
        </button>
        {selectedOption === 'manual' && (
          <div style={{ padding: '1rem', borderTop: '1px solid var(--color-border)' }}>
            <div className="field" style={{ marginBottom: '0.75rem' }}>
              <label htmlFor="manualDbUrl" style={{ fontSize: '0.875rem' }}>PostgreSQL connection string</label>
              <input
                id="manualDbUrl"
                type="text"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                value={manualDbUrl}
                onChange={(e) => setManualDbUrl(e.target.value)}
                placeholder="postgresql://user:pass@host/db?sslmode=require"
                style={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}
              />
              <span className="field-hint">Use a pooled connection string from Neon, Supabase, or any PostgreSQL provider.</span>
            </div>
            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              disabled={!manualDbUrl.trim()}
              onClick={() => onSaveManualUrl(manualDbUrl.trim())}
            >
              Save &amp; deploy →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function DbManualPanel({
  onSaveUrl,
  onBack,
}: {
  onSaveUrl: (url: string) => void
  onBack?: () => void
}) {
  const [url, setUrl] = useState('')

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
        <span style={{ color: 'var(--color-danger)', fontWeight: 700, flexShrink: 0 }}>✗</span>
        <div>
          <code style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>DATABASE_URL</code>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>Paste your PostgreSQL connection string below.</div>
        </div>
      </div>

      <div className="field" style={{ marginBottom: '0.75rem' }}>
        <label htmlFor="manualDbUrlPanel" style={{ fontSize: '0.875rem' }}>PostgreSQL connection string</label>
        <input
          id="manualDbUrlPanel"
          type="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="postgresql://user:pass@host/db?sslmode=require"
          style={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}
        />
        <span className="field-hint">Use a pooled connection string from Neon, Supabase, or any PostgreSQL provider. Cactus Foundation saves it to Vercel and redeploys automatically.</span>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        {onBack && (
          <button className="btn btn-secondary" style={{ fontSize: '0.875rem' }} onClick={onBack}>
            ← Back
          </button>
        )}
        <button
          className="btn btn-primary"
          style={{ flex: 1 }}
          disabled={!url.trim()}
          onClick={() => onSaveUrl(url.trim())}
        >
          Save &amp; deploy →
        </button>
      </div>
    </div>
  )
}

function DbRedeployingPanel({
  deployState,
  deployLogs,
  deploymentId,
  redeployError,
  onRetryRedeploy,
}: {
  deployState: string
  deployLogs: string[]
  deploymentId: string | null
  redeployError: string
  onRetryRedeploy: () => void
}) {
  const stateLabel =
    deployState === 'BUILDING' ? 'Building…' :
    deployState === 'READY' ? 'Done' :
    deployState === 'ERROR' ? 'Failed' :
    deployState === 'CANCELED' ? 'Cancelled' :
    deployState || ''
  const deployFailed = deployState === 'ERROR' || deployState === 'CANCELED'

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
        <span style={{ color: 'var(--color-success)', fontWeight: 700, flexShrink: 0 }}>✓</span>
        <div>
          <code style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>DATABASE_URL</code>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-success)' }}>Database connection string written to Vercel</div>
        </div>
      </div>

      {redeployError ? (
        <div className="alert alert-warning">
          <strong>The connection string is saved, but the redeploy could not be started.</strong>
          <div style={{ fontSize: '0.8125rem', marginTop: '0.25rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {redeployError}
          </div>
          <div style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
            You can retry below, or trigger a redeploy from the Vercel dashboard
            (Deployments → ⋯ → Redeploy). Setup continues automatically once the
            new deployment is up.
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: '0.625rem' }}
            onClick={onRetryRedeploy}
          >
            Retry redeploy
          </button>
        </div>
      ) : deployFailed ? (
        <div className="alert alert-danger">
          <strong>The redeploy failed.</strong>
          <div style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
            The deployment ended in a {deployState === 'CANCELED' ? 'cancelled' : 'failed'} state,
            so the new database connection isn&apos;t live yet. Check the log below for the cause,
            then retry.
          </div>
          {deployLogs.length > 0 && (
            <div style={{ marginTop: '0.625rem' }}>
              <DeployLogViewer rawLines={deployLogs} />
            </div>
          )}
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: '0.625rem' }}
            onClick={onRetryRedeploy}
          >
            Retry redeploy
          </button>
        </div>
      ) : (
        <div className="alert alert-info" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
          <span className="setup-spinner" style={{ marginTop: 2, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {deploymentId ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: deployLogs.length > 0 ? '0.5rem' : 0 }}>
                  <strong>Redeploying…</strong>
                  {stateLabel && (
                    <span style={{ fontSize: '0.75rem', padding: '0.125rem 0.5rem', borderRadius: 99, background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                      {stateLabel}
                    </span>
                  )}
                </div>
                {deployLogs.length > 0 && (
                  <DeployLogViewer rawLines={deployLogs} />
                )}
              </>
            ) : (
              <span>
                <strong>Database connected.</strong> Your app is redeploying to pick up the new connection — this takes a minute or two.
                During the redeploy, the database schema migrations run automatically via the build script.
                <br /><br />
                This page will continue automatically once the database is reachable.{' '}
                <span style={{ color: 'var(--color-muted)' }}>(Checking every 5 seconds…)</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
