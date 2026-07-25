import { createHmac, timingSafeEqual } from 'node:crypto'
import { getSessionSecret, getSequenceWorkerUrl, getSequenceWorkerSecret } from '@/lib/config/env'

// Client for the off-platform sequence worker (services/sequence-worker) plus the
// signed "context" token the worker echoes back on its completion callback.
//
// Why a context token exists: a conversion takes many minutes - far longer than
// an admin will keep a tab open - so a sequence's library row is created when the
// worker calls back, not by the browser. The callback body carries the produced
// manifest (its key, frame count, dimensions) but knows nothing about the app:
// which library folder to file the tile under, or the display name the admin
// chose. We stash those two facts in a short signed token at enqueue time, hand
// it to the worker as `callbackToken`, and read them back off the callback. It is
// signed with SESSION_SECRET (same idea as the upload token) so folder/name
// context can't be forged; the callback body itself is separately HMAC-verified
// against the shared worker secret (see verifyCallbackSignature).

const CONTEXT_LABEL = 'cactus-sequence-context-v1'

export type SequenceContext = {
  // Library folder the finished tile is filed under (null = library root).
  folderId: string | null
  // The display name the admin gave the sequence.
  name: string
}

function contextKey(): string {
  return createHmac('sha256', getSessionSecret()).update(CONTEXT_LABEL).digest('hex')
}

// `<base64url(json)>.<sig>`. The payload is readable - it is only a folder id and
// a name, nothing secret - but cannot be altered without the signature failing.
export function signSequenceContext(ctx: SequenceContext): string {
  const payload = Buffer.from(JSON.stringify(ctx), 'utf-8').toString('base64url')
  const sig = createHmac('sha256', contextKey()).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifySequenceContext(token: string): SequenceContext | null {
  const dot = token.indexOf('.')
  if (dot === -1) return null
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = createHmac('sha256', contextKey()).update(payload).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const obj = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as unknown
    if (typeof obj !== 'object' || obj === null) return null
    const rec = obj as Record<string, unknown>
    return {
      folderId: typeof rec.folderId === 'string' ? rec.folderId : null,
      name: typeof rec.name === 'string' ? rec.name : '',
    }
  } catch {
    return null
  }
}

// Verify the worker's callback HMAC: X-Sequence-Signature = hex HMAC-SHA256 of the
// EXACT raw request body, keyed with the shared worker secret. Proves the callback
// really came from our worker (only it holds the secret).
export function verifyCallbackSignature(rawBody: string, signature: string | null): boolean {
  const secret = getSequenceWorkerSecret()
  if (!secret || !signature) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

// ---------------------------------------------------------------------------
// Worker HTTP client
// ---------------------------------------------------------------------------

export class SequenceWorkerError extends Error {}

function workerBase(): string {
  const url = getSequenceWorkerUrl()
  if (!url) throw new SequenceWorkerError('The video conversion service is not configured (SEQUENCE_WORKER_URL).')
  return url
}

function workerAuth(): string {
  const secret = getSequenceWorkerSecret()
  if (!secret) throw new SequenceWorkerError('The video conversion service is not configured (SEQUENCE_WORKER_SECRET).')
  return `Bearer ${secret}`
}

export type EnqueueArgs = {
  videoUrl: string
  destPrefix: string
  sequenceName: string
  fps?: number
  maxWidth?: number
  engine?: 'isnet' | 'birefnet'
  callbackUrl: string
  callbackToken: string
}

export async function enqueueSequenceJob(args: EnqueueArgs): Promise<{ jobId: string }> {
  const res = await fetch(`${workerBase()}/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: workerAuth() },
    body: JSON.stringify(args),
    // The worker enqueues and returns immediately, so a short ceiling is plenty
    // and keeps a wedged network from hanging the admin's request.
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new SequenceWorkerError(`The conversion service rejected the job (HTTP ${res.status}). ${detail.slice(0, 200)}`.trim())
  }
  const data = (await res.json().catch(() => null)) as { jobId?: unknown } | null
  const jobId = data && typeof data.jobId === 'string' ? data.jobId : ''
  if (!jobId) throw new SequenceWorkerError('The conversion service did not return a job id.')
  return { jobId }
}

export type SequenceJobStatus = {
  jobId: string
  status: 'queued' | 'running' | 'done' | 'error'
  progress: number
  error?: string
  manifest?: SequenceManifest
}

// The manifest the worker writes (and returns inline in a done status). Frame
// keys are ordered; every value is a full object key under the media bucket.
export type SequenceManifest = {
  version: number
  fps: number
  width: number
  height: number
  frameCount: number
  hasAlpha: boolean
  engine: string
  poster: string
  frames: string[]
}

export async function getSequenceJob(jobId: string): Promise<SequenceJobStatus> {
  const res = await fetch(`${workerBase()}/jobs/${encodeURIComponent(jobId)}`, {
    headers: { authorization: workerAuth() },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new SequenceWorkerError(`The conversion service status check failed (HTTP ${res.status}).`)
  return (await res.json()) as SequenceJobStatus
}

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

// The folder prefix a manifest key belongs to (up to and including the trailing
// slash) - used to delete a whole sequence, or to locate its sibling poster.
export function prefixFromManifestKey(manifestKey: string): string {
  const i = manifestKey.lastIndexOf('/')
  return i === -1 ? '' : manifestKey.slice(0, i + 1)
}

export function posterKeyFromManifestKey(manifestKey: string): string {
  return `${prefixFromManifestKey(manifestKey)}poster.webp`
}

function slugSegment(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '')
}

// Turn a user-supplied destination path + sequence name into a clean, relative,
// traversal-free prefix the worker will accept (its own guard is _SAFE_PREFIX):
//   path="shop/office-chairs", name="Height Adjustable"
//     -> "shop/office-chairs/height-adjustable"
// The worker writes the frames below `media/<this>/`.
export function buildDestPrefix(path: string, name: string): string {
  const pathPart = path.split('/').map(slugSegment).filter(Boolean).join('/')
  const namePart = slugSegment(name)
  return [pathPart, namePart].filter(Boolean).join('/')
}
