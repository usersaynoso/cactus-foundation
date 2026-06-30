'use client'
import { useEffect, useRef, useState } from 'react'
import DeployLogViewer from '@/components/admin/DeployLogViewer'

export default function RedeployingPage() {
  const [ready, setReady] = useState(false)
  const [deploymentId, setDeploymentId] = useState<string | null>(null)
  const [adminPath, setAdminPath] = useState<string>('')
  const [deployState, setDeployState] = useState<string>('')
  const [deployLogs, setDeployLogs] = useState<string[]>([])
  const [failed, setFailed] = useState(false)
  const [showEscape, setShowEscape] = useState(false)
  const cancelPollRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    let mounted = true
    let autoExitTimer: ReturnType<typeof setTimeout> | undefined
    const escapeTimer = setTimeout(() => { if (mounted) setShowEscape(true) }, 45_000)

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
        // Hard 2-minute auto-exit: the server time-box is authoritative, but if the
        // browser is open and startPolling never sees a terminal state, this ensures
        // the page self-clears within the same window.
        autoExitTimer = setTimeout(() => clearAndRedirect(data.adminPath), 120_000)
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
    deployState === 'INITIALIZING' ? 'Initialising…' :
    deployState === 'BUILDING' ? 'Building…' :
    deployState === 'READY' ? 'Done' :
    deployState === 'ERROR' ? 'Failed' :
    deployState === 'CANCELED' ? 'Cancelled' :
    deployState || ''

  if (!ready) return null

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ maxWidth: 560, width: '100%' }}>
        <h2 style={{ marginBottom: '1.5rem' }}>Redeploying&hellip;</h2>

        {failed ? (
          <>
            <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
              <strong>Deployment failed.</strong> You can dismiss this and continue - your changes may not have taken effect.
            </div>
            {deployLogs.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <DeployLogViewer rawLines={deployLogs} />
              </div>
            )}
            <button className="btn btn-secondary" onClick={handleDismiss}>
              Dismiss and continue
            </button>
          </>
        ) : (
          <>
            <div className="alert alert-info" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              <span className="setup-spinner" style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: deployLogs.length > 0 ? '0.5rem' : 0 }}>
                  <strong>Redeploying to apply your changes.</strong>
                  {stateLabel && (
                    <span style={{ fontSize: '0.75rem', padding: '0.125rem 0.5rem', borderRadius: 99, background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                      {stateLabel}
                    </span>
                  )}
                </div>
                {deployLogs.length > 0 && (
                  <DeployLogViewer rawLines={deployLogs} />
                )}
              </div>
            </div>
            {showEscape && (
              <div style={{ marginTop: '1rem' }}>
                <p style={{ marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
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
    </main>
  )
}
