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
  // The per-job Fly machine running this conversion (null in shared-worker
  // mode). The webhook destroys it once the job's callback lands.
  machineId?: string | null
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
      machineId: typeof rec.machineId === 'string' ? rec.machineId : null,
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

export class SequenceWorkerError extends Error {
  /** The worker's HTTP status, when the failure came from a response. 404 means
   *  the worker has no record of the job - it restarted and lost it mid-build. */
  readonly status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.status = status
  }
}

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

// ---------------------------------------------------------------------------
// Job refs
// ---------------------------------------------------------------------------
//
// In per-machine mode the id handed to the browser (and stored on the job's
// notification) is `<machineId>:<workerJobId>`, so a later status poll knows
// which machine to ask - the worker keeps jobs in memory only, and with several
// machines running, an unrouted poll would land on the wrong one. Shared-worker
// mode uses the bare worker job id, exactly as before.

export function joinJobRef(machineId: string | null, jobId: string): string {
  return machineId ? `${machineId}:${jobId}` : jobId
}

export function splitJobRef(ref: string): { machineId: string | null; jobId: string } {
  const i = ref.indexOf(':')
  if (i === -1) return { machineId: null, jobId: ref }
  return { machineId: ref.slice(0, i), jobId: ref.slice(i + 1) }
}

// Route a request to one specific machine behind the app hostname. Fly's proxy
// honours this header for machines that carry the app's service config.
function instanceHeaders(machineId: string | null | undefined): Record<string, string> {
  return machineId ? { 'fly-force-instance-id': machineId } : {}
}

export type EnqueueArgs = {
  videoUrl: string
  destPrefix: string
  sequenceName: string
  fps?: number
  maxWidth?: number
  engine?: 'isnet' | 'birefnet'
  // Key the white studio background out of gaps the cut-out called solid (mesh
  // backs, perforations). Omitted = the worker's own default, which is off.
  seeThrough?: boolean
  // Optional trim window in seconds - the worker only sequences frames between
  // the two. Omitted = from the start / to the end respectively.
  trimStart?: number
  trimEnd?: number
  callbackUrl: string
  callbackToken: string
}

export async function enqueueSequenceJob(
  args: EnqueueArgs,
  opts?: { machineId?: string | null },
): Promise<{ jobId: string }> {
  // A freshly created job machine reports 'started' a moment before uvicorn has
  // bound, so the first request can meet a refused connection or a proxy 502/503.
  // Those retry briefly; any other worker answer is final. In shared-worker mode
  // a single attempt behaves exactly as before.
  const attempts = opts?.machineId ? 6 : 1
  let lastError: Error = new SequenceWorkerError('The conversion service could not be reached.')
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2500))
    let res: Response
    try {
      res = await fetch(`${workerBase()}/jobs`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: workerAuth(),
          ...instanceHeaders(opts?.machineId),
        },
        body: JSON.stringify(args),
        // The worker enqueues and returns immediately, so a short ceiling is
        // plenty and keeps a wedged network from hanging the admin's request.
        signal: AbortSignal.timeout(20_000),
      })
    } catch (err) {
      // Network-level failure (refused, reset, timeout) - retryable.
      lastError = err instanceof Error ? err : new SequenceWorkerError('The conversion service could not be reached.')
      continue
    }
    if (res.status === 502 || res.status === 503) {
      lastError = new SequenceWorkerError(`The conversion service is still starting (HTTP ${res.status}).`)
      continue
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new SequenceWorkerError(`The conversion service rejected the job (HTTP ${res.status}). ${detail.slice(0, 200)}`.trim())
    }
    const data = (await res.json().catch(() => null)) as { jobId?: unknown } | null
    const jobId = data && typeof data.jobId === 'string' ? data.jobId : ''
    if (!jobId) throw new SequenceWorkerError('The conversion service did not return a job id.')
    return { jobId }
  }
  throw lastError
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

export async function getSequenceJob(jobId: string, machineId?: string | null): Promise<SequenceJobStatus> {
  const res = await fetch(`${workerBase()}/jobs/${encodeURIComponent(jobId)}`, {
    headers: { authorization: workerAuth(), ...instanceHeaders(machineId) },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new SequenceWorkerError(`The conversion service status check failed (HTTP ${res.status}).`, res.status)
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
