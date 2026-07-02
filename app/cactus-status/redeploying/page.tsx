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
  const [showEscape, setShowEscape] = useState(false)
  const cancelPollRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    let mounted = true
    let autoExitTimer: ReturnType<typeof setTimeout> | undefined
    const escapeTimer = setTimeout(() => { if (mounted) setShowEscape(true) }, 165_000)

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
      clearTimeout(escapeTimer)
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
    window.location.href = `/${path}/`
  }

  async function handleDismiss() {
    await clearAndRedirect(adminPath)
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
      <div className="setup-card" style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.75rem' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cactus.svg" alt="Cactus Foundation" style={{ width: 36, height: 36, background: 'var(--color-primary-subtle)', borderRadius: 8, padding: 3, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '1.125rem' }}>
              {failed ? 'Redeploy failed' : 'Redeploying your site'}
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
              {failed ? 'Something went wrong along the way.' : 'Sit tight - this usually takes a minute or two.'}
            </div>
          </div>
          <span className={`badge ${badgeClass}`}>{stateLabel}</span>
        </div>

        {failed ? (
          <>
            <div className="alert alert-danger">
              Your changes may not have taken effect. You can dismiss this and carry on - or try again from the admin.
            </div>
            {deployLogs.length > 0 && (
              <div style={{ marginBottom: '1.5rem' }}>
                <DeployLogViewer rawLines={deployLogs} />
              </div>
            )}
            <button className="btn btn-secondary" onClick={handleDismiss}>
              Dismiss and continue
            </button>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <span className="setup-spinner" style={{ width: 20, height: 20, color: 'var(--color-primary)' }} />
              <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                Applying your changes and bringing the site back up.
              </div>
            </div>
            {deployLogs.length > 0 && (
              <DeployLogViewer rawLines={deployLogs} />
            )}
            {showEscape && (
              <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--color-border)' }}>
                <p style={{ marginBottom: '0.75rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                  Taking longer than expected? You can dismiss this and carry on - your changes may not have taken effect yet.
                </p>
                <button className="btn btn-secondary" onClick={handleDismiss}>
                  Dismiss and continue
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
