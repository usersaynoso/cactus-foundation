// Reading a scroll-sequence job back out of the notification that carries it.
//
// A conversion has no table of its own: upsertSequenceNotification (lib/
// notifications/alerts.ts) keeps a single notification per job, keyed
// `sequence-job:{jobId}`, holding the job's state in its title and its latest
// progress in reasons[0]. These helpers are the other half of that contract.
//
// Deliberately free of any server import so the notification bell (a client
// component) and the Media > Scroll sequences panel read a job the same way.

export type SequenceJobState = 'queued' | 'running' | 'done' | 'error'

export const SEQUENCE_DEDUPE_PREFIX = 'sequence-job:'

export type SequenceJobSummary = {
  jobId: string
  name: string
  state: SequenceJobState
  /** 0-100, or null when the worker hasn't reported a figure yet. */
  progress: number | null
  detail: string | null
}

type ReasonRow = { label?: unknown; detail?: unknown }

export function isSequenceDedupeKey(dedupeKey: string | null | undefined): boolean {
  return typeof dedupeKey === 'string' && dedupeKey.startsWith(SEQUENCE_DEDUPE_PREFIX)
}

export function sequenceJobIdFrom(dedupeKey: string | null | undefined): string {
  return isSequenceDedupeKey(dedupeKey) ? (dedupeKey as string).slice(SEQUENCE_DEDUPE_PREFIX.length) : ''
}

// Title prefixes upsertSequenceNotification writes. "in progress" covers both the
// queued and running phases (the title doesn't distinguish them); reasons[0].label
// does, so we read the finer state from there and fall back to the title.
export function stateFromNotification(title: string, label: string | null): SequenceJobState {
  if (title.startsWith('Scroll sequence complete:') || label === 'Finished') return 'done'
  if (title.startsWith('Scroll sequence failed:') || label === 'Failed') return 'error'
  if (label === 'Building') return 'running'
  return 'queued'
}

export function nameFromTitle(title: string): string {
  return title.replace(/^Scroll sequence (?:in progress|complete|failed): /, '')
}

// Pull the "NN%" a progress detail leads with back into a number, tolerating the
// "NN% - detail" shape upsertSequenceNotification writes when it has both.
export function progressFromDetail(detail: string | null): number | null {
  if (!detail) return null
  const m = detail.match(/^(\d+)%/)
  if (!m) return null
  const n = parseInt(m[1] ?? '', 10)
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null
}

// The whole job, from the three notification fields that describe it. Returns
// null for any notification that isn't a scroll-sequence job.
export function parseSequenceNotification(row: {
  dedupeKey?: string | null
  title: string
  reasons?: unknown
}): SequenceJobSummary | null {
  if (!isSequenceDedupeKey(row.dedupeKey)) return null
  const reason = (Array.isArray(row.reasons) ? (row.reasons[0] as ReasonRow | undefined) : undefined) ?? undefined
  const label = reason && typeof reason.label === 'string' ? reason.label : null
  const detail = reason && typeof reason.detail === 'string' ? reason.detail : null
  return {
    jobId: sequenceJobIdFrom(row.dedupeKey),
    name: nameFromTitle(row.title),
    state: stateFromNotification(row.title, label),
    progress: progressFromDetail(detail),
    detail,
  }
}

export function isSequenceInFlight(state: SequenceJobState): boolean {
  return state === 'queued' || state === 'running'
}
