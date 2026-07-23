'use client'

// Client-side singleton tracking the current media-upload batch for the whole
// admin page. The media library writes tasks here as it uploads; the
// notification bell subscribes and renders live progress. This keeps one shared
// source of truth so uploads show in the bell (not a separate floating panel)
// and survive across the admin chrome for as long as the page lives.
//
// These are ephemeral, page-scoped items - deliberately NOT persisted and with
// no read/unread state, unlike the DB-backed notifications alongside them.
//
// Built to hold tens of thousands of files at once. Two things make that scale:
//   - Tasks live in a Map, so a progress update is O(1), not an O(n) rebuild of
//     the whole array on every byte-progress event (that turned a 25,000-file
//     drop into a locked tab).
//   - Listeners are notified on a throttle, and what they get is a small
//     pre-computed snapshot (totals + a capped visible list), never the full
//     25,000 rows - so the bell repaints a few times a second over a handful of
//     rows, not once per progress event over thousands of DOM nodes.

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'error' | 'skipped'
export type UploadTask = {
  id: string
  name: string
  size: number
  status: UploadStatus
  /** 0..1 transfer fraction, only meaningful while uploading. */
  progress: number
  error?: string
  /** Human name of the folder the file is landing in. */
  destination: string
}

/**
 * Everything the bell needs to render the upload section, pre-aggregated so the
 * bell never scans the full task list itself. `visible` is capped: a batch of
 * 25,000 files is summarised by its totals and an overall bar, with only the
 * failures and the handful currently in flight listed by name.
 */
export type UploadSnapshot = {
  /** queued + uploading + done + error + skipped. */
  total: number
  /** queued + uploading - the count shown as "Uploading N files…". */
  active: number
  done: number
  failed: number
  skipped: number
  /** 0..1 across the whole batch (finished files count as 1). */
  overallProgress: number
  /** Up to VISIBLE_CAP rows: failures first, then in-flight, then finished. */
  visible: UploadTask[]
  /** How many tasks aren't in `visible` (so the bell can say "…and N more"). */
  hidden: number
}

/** Fired when a fresh batch is enqueued, so the bell can pop itself open. */
export const UPLOAD_STARTED_EVENT = 'cactus:upload-started'

// The most rows the bell will ever list. Everything past this is summarised by
// the header counts and the overall bar - a per-file row for the 12,000th of
// 25,000 photos is noise, and drawing it is what froze the page.
const VISIBLE_CAP = 50

// Progress events fire many times a second per file, so across a big batch that
// is thousands a second. Rebuilding the snapshot and repainting the bell that
// often is what locks the tab; coalescing to this cadence keeps the bar smooth
// while the workers get on with it. A trailing flush always lands, so the final
// tally is never left stranded behind the throttle.
const FLUSH_MS = 120

const byId = new Map<string, UploadTask>()
const order: string[] = []

const EMPTY_SNAPSHOT: UploadSnapshot = {
  total: 0, active: 0, done: 0, failed: 0, skipped: 0, overallProgress: 0, visible: [], hidden: 0,
}
// A single stable reference for the current snapshot - useSyncExternalStore
// requires getSnapshot to return a cached value, reassigned only when it changes.
let snapshot: UploadSnapshot = EMPTY_SNAPSHOT
const listeners = new Set<() => void>()

let flushTimer: ReturnType<typeof setTimeout> | null = null

// One O(n) pass over the batch: tally each status, sum progress for the overall
// bar, and collect a capped list to show. Each bucket stops growing once it has
// enough to fill the cap, so this stays cheap even at 25,000 tasks - and it only
// runs on a flush (a few times a second), never per progress event.
function rebuild(): void {
  let active = 0, done = 0, failed = 0, skipped = 0
  let progressSum = 0
  const errors: UploadTask[] = []
  const inflight: UploadTask[] = []
  const finished: UploadTask[] = []
  for (const id of order) {
    const t = byId.get(id)
    if (!t) continue
    switch (t.status) {
      case 'uploading':
        active++; progressSum += t.progress
        if (inflight.length < VISIBLE_CAP) inflight.push(t)
        break
      case 'queued':
        active++
        if (inflight.length < VISIBLE_CAP) inflight.push(t)
        break
      case 'done':
        done++; progressSum += 1
        if (finished.length < VISIBLE_CAP) finished.push(t)
        break
      case 'skipped':
        skipped++; progressSum += 1
        if (finished.length < VISIBLE_CAP) finished.push(t)
        break
      case 'error':
        failed++; progressSum += 1
        if (errors.length < VISIBLE_CAP) errors.push(t)
        break
    }
  }
  const total = active + done + failed + skipped
  // Failures first (they need attention), then what's moving, then the done pile.
  const visible = [...errors, ...inflight, ...finished].slice(0, VISIBLE_CAP)
  snapshot = {
    total, active, done, failed, skipped,
    overallProgress: total ? progressSum / total : 0,
    visible,
    hidden: Math.max(0, total - visible.length),
  }
}

function flushNow(): void {
  if (flushTimer !== null) { clearTimeout(flushTimer); flushTimer = null }
  rebuild()
  listeners.forEach((l) => l())
}

function scheduleFlush(): void {
  if (flushTimer !== null) return
  flushTimer = setTimeout(() => { flushTimer = null; flushNow() }, FLUSH_MS)
}

export function getUploadSnapshot(): UploadSnapshot {
  return snapshot
}

export function getServerUploadSnapshot(): UploadSnapshot {
  return EMPTY_SNAPSHOT
}

export function subscribeUploads(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

/** Add a batch of tasks and broadcast so the bell opens to show them. */
export function addUploads(tasks: UploadTask[]) {
  for (const t of tasks) {
    if (!byId.has(t.id)) order.push(t.id)
    byId.set(t.id, t)
  }
  flushNow()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(UPLOAD_STARTED_EVENT))
  }
}

export function updateUpload(id: string, patch: Partial<UploadTask>) {
  const cur = byId.get(id)
  if (!cur) return
  byId.set(id, { ...cur, ...patch })
  // Every mutation - progress ticks and terminal transitions alike - is
  // coalesced. Flushing on each terminal transition would be O(n) per finished
  // file, i.e. O(n²) as 25,000 files complete; the trailing flush after the last
  // update carries the final tally within FLUSH_MS.
  scheduleFlush()
}

/** Drop every finished task, leaving anything still in flight. */
export function clearFinishedUploads() {
  const kept: string[] = []
  for (const id of order) {
    const t = byId.get(id)
    if (t && (t.status === 'queued' || t.status === 'uploading')) kept.push(id)
    else byId.delete(id)
  }
  order.length = 0
  order.push(...kept)
  flushNow()
}

export function dismissUpload(id: string) {
  if (!byId.delete(id)) return
  const i = order.indexOf(id)
  if (i >= 0) order.splice(i, 1)
  flushNow()
}
