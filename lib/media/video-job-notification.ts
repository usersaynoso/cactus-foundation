// Reading a video-optimise job back out of the notification that carries it.
//
// A job has no table of its own: upsertVideoJobNotification (lib/notifications/
// alerts.ts) keeps a single notification per job, keyed `video-job:{jobRef}`,
// holding the job's state in its title and its latest progress in reasons[0].
// These helpers are the other half of that contract.
//
// Deliberately free of any server import so the notification bell (a client
// component) and the notifications page read a job the same way.

export type VideoJobState = 'queued' | 'running' | 'done' | 'error'

export const VIDEO_JOB_DEDUPE_PREFIX = 'video-job:'

export type VideoJobSummary = {
  jobId: string
  name: string
  state: VideoJobState
  /** 0-100, or null when the worker hasn't reported a figure yet. */
  progress: number | null
  detail: string | null
}

type ReasonRow = { label?: unknown; detail?: unknown }

export function isVideoJobDedupeKey(dedupeKey: string | null | undefined): boolean {
  return typeof dedupeKey === 'string' && dedupeKey.startsWith(VIDEO_JOB_DEDUPE_PREFIX)
}

export function videoJobIdFrom(dedupeKey: string | null | undefined): string {
  return isVideoJobDedupeKey(dedupeKey) ? (dedupeKey as string).slice(VIDEO_JOB_DEDUPE_PREFIX.length) : ''
}

// The three titles upsertVideoJobNotification writes. "Optimising video" covers
// both the queued and running phases (the title doesn't distinguish them);
// reasons[0].label does, so the finer state is read from there with the title as
// the fallback.
export function videoJobTitle(name: string, state: VideoJobState): string {
  if (state === 'done') return `Video optimised: ${name}`
  if (state === 'error') return `Video optimise failed: ${name}`
  return `Optimising video: ${name}`
}

export function videoNameFromTitle(title: string): string {
  return title.replace(/^(?:Optimising video|Video optimised|Video optimise failed): /, '')
}

export function stateFromNotification(title: string, label: string | null): VideoJobState {
  if (title.startsWith('Video optimised:') || label === 'Finished') return 'done'
  if (title.startsWith('Video optimise failed:') || label === 'Failed') return 'error'
  if (label === 'Encoding') return 'running'
  return 'queued'
}

// Pull the "NN%" a progress detail leads with back into a number, tolerating the
// "NN% - detail" shape upsertVideoJobNotification writes when it has both.
export function progressFromDetail(detail: string | null): number | null {
  if (!detail) return null
  const m = detail.match(/^(\d+)%/)
  if (!m) return null
  const n = parseInt(m[1] ?? '', 10)
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null
}

/** The job a notification describes, or null for a notification that isn't one. */
export function parseVideoJobNotification(row: {
  dedupeKey?: string | null
  title: string
  reasons?: unknown
}): VideoJobSummary | null {
  if (!isVideoJobDedupeKey(row.dedupeKey)) return null
  const reason = (Array.isArray(row.reasons) ? (row.reasons[0] as ReasonRow | undefined) : undefined) ?? undefined
  const label = reason && typeof reason.label === 'string' ? reason.label : null
  const detail = reason && typeof reason.detail === 'string' ? reason.detail : null
  return {
    jobId: videoJobIdFrom(row.dedupeKey),
    name: videoNameFromTitle(row.title),
    state: stateFromNotification(row.title, label),
    progress: progressFromDetail(detail),
    detail,
  }
}

export function isVideoJobInFlight(state: VideoJobState): boolean {
  return state === 'queued' || state === 'running'
}
