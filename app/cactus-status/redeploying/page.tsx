'use client'
import { useEffect, useRef, useState } from 'react'

export default function RedeployingPage() {
  const [ready, setReady] = useState(false)
  const [deploymentId, setDeploymentId] = useState<string | null>(null)
  const [adminPath, setAdminPath] = useState<string>('')
  const [deployState, setDeployState] = useState<string>('')
  const [deployLogs, setDeployLogs] = useState<string[]>([])
  const [failed, setFailed] = useState(false)
  const cancelPollRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    let mounted = true
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
      cancelPollRef.current?.()
    }
  }, [])

  function startPolling(id: string, path: string): () => void {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    let lastSeen: number | null = null

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
            if (data.logLines && data.logLines.length > 0) setDeployLogs(data.logLines)
            if (data.latestTimestamp) lastSeen = data.latestTimestamp
            if (data.state === 'READY') {
              cancelled = true
              await clearAndRedirect(path)
              return
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
              <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', background: 'rgba(0,0,0,0.05)', borderRadius: 4, padding: '0.5rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginBottom: '1rem' }}>
                {deployLogs.map((line, i) => <div key={i}>{line}</div>)}
              </div>
            )}
            <button className="btn btn-secondary" onClick={handleDismiss}>
              Dismiss and continue
            </button>
          </>
        ) : (
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
                <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', background: 'rgba(0,0,0,0.05)', borderRadius: 4, padding: '0.5rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {deployLogs.map((line, i) => <div key={i}>{line}</div>)}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
