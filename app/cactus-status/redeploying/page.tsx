'use client'
import { useEffect, useRef, useState } from 'react'
import DeployLogViewer from '@/components/admin/DeployLogViewer'

export default function RedeployingPage() {
  const [ready, setReady] = useState(false)
  const [deploymentId, setDeploymentId] = useState<string | null>(null)
  const [adminPath, setAdminPath] = useState<string>('')
  const [deployState, setDeployState] = useState<string>('')
  const [deployDone, setDeployDone] = useState(false)
  const [deployLogs, setDeployLogs] = useState<string[]>([])
  const [failed, setFailed] = useState(false)
  const cancelPollRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    let mounted = true
    let autoExitTimer: ReturnType<typeof setTimeout> | undefined

    async function init() {
      try {
        const res = await fetch('/api/admin/redeploy-status')
        if (!res.ok) return
        const data = (await res.json()) as { deploymentId: string | null; adminPath: string }
        if (!mounted) return
        setAdminPath(data.adminPath)
        if (!data.deploymentId) {
          window.location.href = `/${data.adminPath}/`
          return
        }
        // Hard auto-exit: the server time-box (REDEPLOY_MAX_MS in lib/config/site.ts) is
        // authoritative, but if the browser is open and startPolling never sees a terminal
        // state, this ensures the page self-clears within the same window. Kept in step with
        // the server value so this never fires first and skips reconciliation.
        autoExitTimer = setTimeout(() => clearAndRedirect(data.adminPath), 240_000)
        if (data.deploymentId === 'pending') {
          // Sentinel written synchronously by the admin action; the real Vercel
          // deployment ID arrives shortly via after(). Show the spinner now and
          // poll until it lands, then switch over to log polling.
          setReady(true)
          cancelPollRef.current = pollForId(data.adminPath)
          return
        }
        setDeploymentId(data.deploymentId)
        setReady(true)
        cancelPollRef.current = startPolling(data.deploymentId, data.adminPath)
      } catch {
        // ignore
      }
    }
    init()
    return () => {
      mounted = false
      clearTimeout(autoExitTimer)
      cancelPollRef.current?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pollForId and startPolling are defined inside this effect; empty deps is intentional (run once on mount)
  }, [])

  function pollForId(path: string): () => void {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    async function poll() {
      if (cancelled) return
      try {
        const res = await fetch('/api/admin/redeploy-status')
        if (res.ok) {
          const data = (await res.json()) as { deploymentId: string | null; adminPath: string }
          if (!cancelled) {
            if (data.deploymentId === null) {
              // Sentinel cleared (redeploy never started) — bounce back to admin.
              cancelled = true
              window.location.href = `/${path}/`
              return
            }
            if (data.deploymentId && data.deploymentId !== 'pending') {
              cancelled = true
              setDeploymentId(data.deploymentId)
              cancelPollRef.current = startPolling(data.deploymentId, path)
              return
            }
          }
        }
      } catch {
        // ignore transient errors while the real ID is being written
      }
      if (!cancelled) timer = setTimeout(poll, 2_000)
    }

    poll()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }

  function startPolling(id: string, path: string): () => void {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    let lastSeen: number | null = null
    let postReadyPolls = 0
    const MAX_POST_READY_POLLS = 10

    async function poll() {
      if (cancelled) return
      try {
        const url = lastSeen
          ? `/api/setup/deployment-logs?deploymentId=${encodeURIComponent(id)}&since=${lastSeen}`
          : `/api/setup/deployment-logs?deploymentId=${encodeURIComponent(id)}`
        const res = await fetch(url)
        if (res.ok) {
          const data = (await res.json()) as { state?: string; logLines?: string[]; latestTimestamp?: number | null }
          if (!cancelled) {
            if (data.state) setDeployState(data.state)
            const lines = data.logLines
            if (lines && lines.length > 0) setDeployLogs(prev => [...prev, ...lines])
            if (data.latestTimestamp) lastSeen = data.latestTimestamp
            if (data.state === 'READY') {
              postReadyPolls++
              const tailDone =
                lines?.some(l => l.includes('Build cache uploaded')) ||
                postReadyPolls >= MAX_POST_READY_POLLS
              if (tailDone) {
                cancelled = true
                setDeployDone(true)
                await new Promise(r => setTimeout(r, 2_000))
                await clearAndRedirect(path)
                return
              }
            }
            if (data.state === 'ERROR' || data.state === 'CANCELED') {
              cancelled = true
              setFailed(true)
              return
            }
          }
        }
      } catch {
        // ignore transient errors during redeploy
      }
      if (!cancelled) timer = setTimeout(poll, 4_000)
    }

    poll()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }

  async function clearAndRedirect(path: string) {
    try {
      await fetch('/api/admin/redeploy-status', { method: 'DELETE' })
    } catch {
      // best-effort
    }
    // Drop the config page's sessionStorage update-check cache so it re-fetches
    // fresh status instead of showing the pre-deploy "update available" state
    // it cached before this redeploy landed.
    try {
      sessionStorage.removeItem('cactus-core-update-check')
    } catch {
      // ignore (e.g. storage disabled)
    }
    window.location.href = `/${path}/`
  }

  async function handleDismiss() {
    await clearAndRedirect(adminPath)
  }

  // Lets the admin keep working elsewhere while the deploy finishes: sets the
  // cookie proxy.ts checks to skip its full-page trap, then hands off to
  // DeployStatusBar (mounted in the admin shell) to keep polling and reload
  // the page once the deploy lands.
  function handleMinimize() {
    document.cookie = 'cactus-redeploy-minimized=1; path=/; max-age=300'
    window.location.href = `/${adminPath}/`
  }

  const stateLabel =
    deployState === 'INITIALIZING' ? 'Initialising' :
    deployState === 'BUILDING' ? 'Building' :
    deployState === 'READY' ? (deployDone ? 'Done' : 'Finishing up') :
    deployState === 'ERROR' ? 'Failed' :
    deployState === 'CANCELED' ? 'Cancelled' :
    deployState || 'Starting'

  const badgeClass =
    deployState === 'READY' ? (deployDone ? 'badge-success' : 'badge-info') :
    deployState === 'ERROR' || deployState === 'CANCELED' ? 'badge-danger' :
    deployState === 'BUILDING' ? 'badge-info' :
    'badge-default'

  if (!ready) return null

  return (
    <div className="setup-shell">
      <div className="setup-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cactus.svg" alt="Cactus Foundation" style={{ width: 'var(--space-8)', height: 'var(--space-8)', background: 'var(--color-primary-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-0-5)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-lg)' }}>
              {failed ? 'Redeploy failed' : 'Redeploying your site'}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              {failed ? 'Something went wrong along the way.' : 'Sit tight - this usually takes a minute or two.'}
            </div>
          </div>
          <span className={`badge ${badgeClass}`}>{stateLabel}</span>
        </div>

        {!failed && !deployDone && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleMinimize}
            style={{ marginBottom: 'var(--space-6)' }}
          >
            Minimize
          </button>
        )}

        {failed ? (
          <>
            <div className="alert alert-danger">
              Your changes may not have taken effect. You can dismiss this and carry on - or try again from the admin.
            </div>
            {deployLogs.length > 0 && (
              <div style={{ marginBottom: 'var(--space-6)' }}>
                <DeployLogViewer rawLines={deployLogs} />
              </div>
            )}
            <button className="btn btn-secondary" onClick={handleDismiss}>
              Dismiss and continue
            </button>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
              <span className="setup-spinner" style={{ width: 'var(--space-5)', height: 'var(--space-5)', color: 'var(--color-primary)' }} />
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                Applying your changes and bringing the site back up.
              </div>
            </div>
            {deployLogs.length > 0 && (
              <DeployLogViewer rawLines={deployLogs} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
