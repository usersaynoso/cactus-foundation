'use client'

// Client-side singleton tracking the current media-upload batch for the whole
// admin page. The media library writes tasks here as it uploads; the
// notification bell subscribes and renders live progress. This keeps one shared
// source of truth so uploads show in the bell (not a separate floating panel)
// and survive across the admin chrome for as long as the page lives.
//
// These are ephemeral, page-scoped items - deliberately NOT persisted and with
// no read/unread state, unlike the DB-backed notifications alongside them.

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

/** Fired when a fresh batch is enqueued, so the bell can pop itself open. */
export const UPLOAD_STARTED_EVENT = 'cactus:upload-started'

// A single stable empty reference for the server snapshot - useSyncExternalStore
// requires getSnapshot to return a cached value, not a fresh array each call.
const EMPTY: UploadTask[] = []
let uploads: UploadTask[] = EMPTY
const listeners = new Set<() => void>()

function emit(next: UploadTask[]) {
  uploads = next
  listeners.forEach((l) => l())
}

export function getUploads(): UploadTask[] {
  return uploads
}

export function getServerUploads(): UploadTask[] {
  return EMPTY
}

export function subscribeUploads(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

/** Add a batch of tasks and broadcast so the bell opens to show them. */
export function addUploads(tasks: UploadTask[]) {
  emit([...uploads, ...tasks])
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(UPLOAD_STARTED_EVENT))
  }
}

export function updateUpload(id: string, patch: Partial<UploadTask>) {
  emit(uploads.map((t) => (t.id === id ? { ...t, ...patch } : t)))
}

/** Drop every finished task, leaving anything still in flight. */
export function clearFinishedUploads() {
  emit(uploads.filter((t) => t.status === 'queued' || t.status === 'uploading'))
}

export function dismissUpload(id: string) {
  emit(uploads.filter((t) => t.id !== id))
}
