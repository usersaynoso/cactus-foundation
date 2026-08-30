'use client'
import { useSyncExternalStore } from 'react'
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

// True while a build the site started is still running.
//
// Every install, update, uninstall and redeploy route refuses inside that window
// with a 409 (see lib/deploy/in-flight.ts): a second commit stacks a second build
// on the first, and whichever lands first promotes every module queued for
// either. This is how the buttons that call them grey out, so nobody has to
// discover the rule by being refused.
//
// Server-renders false and stays false on the first client render, so the button
// hydrates matching its SSR markup and only then flips.
//
// A FAILED build is not one of those windows. `active` also keeps the status
// panel on screen (DeployStatusLive returns null without it), and that panel is
// where the Dismiss button lives, so the store cannot simply drop it on ERROR.
// Reading it raw here was a lockout: a build that errored left every install,
// update and redeploy button greyed for the life of every later page load,
// because nothing clears pendingRedeployId on a failure - only a successful
// deploy or that Dismiss click does. getDeployInFlight() on the server has
// always answered null for an ERRORed deployment, so the routes would have
// accepted the work the buttons refused to offer. Watched happen 2026-08-30:
// a module update whose build failed left the admin unable to apply the fix.
export function isDeployInFlight(status: DeployStatus): boolean {
  return status.active && !status.failed
}

export function useDeployInFlight(): boolean {
  return isDeployInFlight(
    useSyncExternalStore(subscribeDeployStatus, getDeployStatus, getServerDeployStatus)
  )
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
