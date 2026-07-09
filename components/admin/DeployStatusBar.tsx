'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { translateLogLine } from '@/lib/deploy-log-translator'

// Persistent, always-mounted companion to /cactus-status/redeploying: renders
// nothing unless a redeploy is genuinely pending (checked on mount via the same
// /api/admin/redeploy-status endpoint the full-page screen uses), so it's safe
// to mount on every admin page without an extra round-trip most of the time.
export default function DeployStatusBar() {
  const [visible, setVisible] = useState(false)
  const [deployState, setDeployState] = useState('')
  const [latestLine, setLatestLine] = useState('')
  const [failed, setFailed] = useState(false)
  const cancelPollRef = useRef<(() => void) | null>(null)

  async function finish() {
    document.cookie = 'cactus-redeploy-minimized=; path=/; max-age=0'
    try {
      await fetch('/api/admin/redeploy-status', { method: 'DELETE' })
    } catch {
      // best-effort
    }
    try {
      sessionStorage.removeItem('cactus-core-update-check')
    } catch {
      // ignore
    }
    window.location.reload()
  }

  function startPolling(id: string): () => void {
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
            if (lines) {
              for (const raw of lines) {
                const text = translateLogLine(raw)
                if (text) setLatestLine(text)
              }
            }
            if (data.latestTimestamp) lastSeen = data.latestTimestamp
            if (data.state === 'READY') {
              postReadyPolls++
              const tailDone =
                lines?.some(l => l.includes('Build cache uploaded')) ||
                postReadyPolls >= MAX_POST_READY_POLLS
              if (tailDone) {
                cancelled = true
                finish()
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
    return () => { cancelled = true; clearTimeout(timer) }
  }

  function pollForId(): () => void {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    async function poll() {
      if (cancelled) return
      try {
        const res = await fetch('/api/admin/redeploy-status')
        if (res.ok) {
          const data = (await res.json()) as { deploymentId: string | null }
          if (!cancelled) {
            if (!data.deploymentId) { cancelled = true; setVisible(false); return }
            if (data.deploymentId !== 'pending') {
              cancelled = true
              cancelPollRef.current = startPolling(data.deploymentId)
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
    return () => { cancelled = true; clearTimeout(timer) }
  }

  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        const res = await fetch('/api/admin/redeploy-status')
        if (!res.ok || !mounted) return
        const data = (await res.json()) as { deploymentId: string | null; adminPath: string }
        if (!mounted || !data.deploymentId) return
        setVisible(true)
        if (data.deploymentId === 'pending') {
          cancelPollRef.current = pollForId()
          return
        }
        cancelPollRef.current = startPolling(data.deploymentId)
      } catch {
        // ignore — bar just stays hidden
      }
    }
    init()
    return () => {
      mounted = false
      cancelPollRef.current?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pollForId/startPolling are stable across renders; run once on mount
  }, [])

  async function handleDismiss() {
    document.cookie = 'cactus-redeploy-minimized=; path=/; max-age=0'
    try {
      await fetch('/api/admin/redeploy-status', { method: 'DELETE' })
    } catch {
      // best-effort
    }
    setVisible(false)
  }

  if (!visible) return null

  const stateLabel =
    deployState === 'INITIALIZING' ? 'Initialising' :
    deployState === 'BUILDING' ? 'Building' :
    deployState === 'READY' ? 'Finishing up' :
    failed ? 'Failed' :
    deployState || 'Starting'

  return (
    <div
      className="admin-deploy-bar"
      style={{
        background: failed ? 'var(--color-error-bg)' : 'var(--color-primary-subtle)',
        border: `1px solid ${failed ? 'var(--color-destructive-border)' : 'var(--color-border)'}`,
      }}
    >
      {!failed && <span className="setup-spinner admin-deploy-bar-spinner" style={{ color: 'var(--color-primary)' }} />}
      <span className={`badge ${failed ? 'badge-danger' : 'badge-info'}`}>{stateLabel}</span>
      <span className="admin-deploy-bar-message">
        {failed ? 'Your changes may not have taken effect.' : (latestLine || 'Applying your changes and bringing the site back up.')}
      </span>
      {failed ? (
        <button type="button" className="btn btn-secondary" onClick={handleDismiss}>Dismiss</button>
      ) : (
        <Link href="/cactus-status/redeploying" className="btn btn-secondary">Expand</Link>
      )}
    </div>
  )
}
