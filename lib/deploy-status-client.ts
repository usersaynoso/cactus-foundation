'use client'
import { translateLogLine } from '@/lib/deploy-log-translator'

// Client-side singleton that tracks an in-flight redeploy for the whole admin
// page: one poller feeds both the notification bell's live status section and
// the notifications page (DeployStatusLive), so the two never double-poll or
// disagree. Lives for the lifetime of the page load.

export type DeployStatus = {
  active: boolean
  failed: boolean
  state: string
  lines: string[]
}

export const REDEPLOY_STARTED_EVENT = 'cactus:redeploy-started'

const IDLE: DeployStatus = { active: false, failed: false, state: '', lines: [] }

let status: DeployStatus = IDLE
let started = false
let cancelCurrent: (() => void) | null = null
const listeners = new Set<() => void>()
const seenLines = new Set<string>()

function emit(next: Partial<DeployStatus>) {
  status = { ...status, ...next }
  listeners.forEach((l) => l())
}

export function getDeployStatus(): DeployStatus {
  return status
}

export function getServerDeployStatus(): DeployStatus {
  return IDLE
}

export function subscribeDeployStatus(cb: () => void): () => void {
  listeners.add(cb)
  if (!started) {
    started = true
    init()
  }
  return () => {
    listeners.delete(cb)
  }
}

export function deployStateLabel(state: string, failed: boolean): string {
  return state === 'INITIALIZING' ? 'Initialising' :
    state === 'BUILDING' ? 'Building' :
    state === 'READY' ? 'Finishing up' :
    failed ? 'Failed' :
    state || 'Starting'
}

// Called by any admin action that has just triggered a redeploy: flips the
// store active immediately (no round-trip needed) and broadcasts an event the
// notification bell listens for to open itself.
export function announceRedeployStarted() {
  started = true
  cancelCurrent?.()
  seenLines.clear()
  status = { active: true, failed: false, state: '', lines: [] }
  listeners.forEach((l) => l())
  cancelCurrent = pollForId()
  window.dispatchEvent(new Event(REDEPLOY_STARTED_EVENT))
}

export async function dismissDeployStatus() {
  cancelCurrent?.()
  cancelCurrent = null
  try {
    await fetch('/api/admin/redeploy-status', { method: 'DELETE' })
  } catch {
    // best-effort
  }
  seenLines.clear()
  emit({ active: false, failed: false, state: '', lines: [] })
}

async function finish() {
  try {
    await fetch('/api/admin/redeploy-status', { method: 'DELETE' })
  } catch {
    // best-effort
  }
  // Drop the config page's sessionStorage update-check cache so it re-fetches
  // fresh status instead of the pre-deploy "update available" state.
  try {
    sessionStorage.removeItem('cactus-core-update-check')
  } catch {
    // ignore
  }
  window.location.reload()
}

async function init() {
  try {
    const res = await fetch('/api/admin/redeploy-status')
    if (!res.ok) return
    const data = (await res.json()) as { deploymentId: string | null }
    if (!data.deploymentId) return
    emit({ active: true })
    if (data.deploymentId === 'pending') {
      cancelCurrent = pollForId()
      return
    }
    cancelCurrent = startPolling(data.deploymentId)
  } catch {
    // ignore - store just stays idle
  }
}

// The redeploy sentinel is written synchronously as 'pending'; the real Vercel
// deployment ID arrives shortly via after(). Poll until it lands, then switch
// over to log polling.
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
          if (!data.deploymentId) {
            // Sentinel cleared (redeploy never started) - stand down.
            cancelled = true
            emit({ active: false, failed: false, state: '', lines: [] })
            return
          }
          if (data.deploymentId !== 'pending') {
            cancelled = true
            cancelCurrent = startPolling(data.deploymentId)
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
          const next: Partial<DeployStatus> = {}
          if (data.state) next.state = data.state
          const lines = data.logLines
          if (lines && lines.length > 0) {
            const translated: string[] = []
            for (const raw of lines) {
              const text = translateLogLine(raw)
              if (!text || seenLines.has(text)) continue
              seenLines.add(text)
              translated.push(text)
            }
            if (translated.length > 0) next.lines = [...status.lines, ...translated]
          }
          if (Object.keys(next).length > 0) emit(next)
          if (data.latestTimestamp) lastSeen = data.latestTimestamp
          if (data.state === 'READY') {
            postReadyPolls++
            const tailDone =
              lines?.some((l) => l.includes('Build cache uploaded')) ||
              postReadyPolls >= MAX_POST_READY_POLLS
            if (tailDone) {
              cancelled = true
              finish()
              return
            }
          }
          if (data.state === 'ERROR' || data.state === 'CANCELED') {
            cancelled = true
            emit({ failed: true })
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
