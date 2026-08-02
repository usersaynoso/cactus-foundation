import { createHmac, timingSafeEqual } from 'node:crypto'
import { getSessionSecret, getMediaWorkerUrl, getMediaWorkerSecret } from '@/lib/config/env'

// Server half of the video optimiser: the signed context token the worker echoes
// back, the callback's signature check, and the HTTP client that queues a job.
//
// It talks to the off-platform media worker (services/video-worker, reached via
// MEDIA_WORKER_URL / MEDIA_WORKER_SECRET): download, re-encode, write back,
// call home.
//
// Why a context token: a re-encode outlives the tab that started it, so the
// media row is updated by the worker's completion callback rather than by the
// browser. The callback knows the object key it wrote and how big the file
// turned out; it knows nothing about which library row that key belongs to. We
// sign that fact at enqueue time and read it back off the callback.

const CONTEXT_LABEL = 'cactus-video-context-v1'

export type VideoJobContext = {
  /** The library row this job is re-encoding. */
  mediaId: string
  /** The per-job Fly machine, so the webhook can destroy it (null = shared worker). */
  machineId?: string | null
  /** Display name, for the notification the admin walks away to. */
  name: string
}

function contextKey(): string {
  return createHmac('sha256', getSessionSecret()).update(CONTEXT_LABEL).digest('hex')
}

export function signVideoContext(ctx: VideoJobContext): string {
  const payload = Buffer.from(JSON.stringify(ctx), 'utf-8').toString('base64url')
  const sig = createHmac('sha256', contextKey()).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifyVideoContext(token: string): VideoJobContext | null {
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
    if (typeof rec.mediaId !== 'string' || !rec.mediaId) return null
    return {
      mediaId: rec.mediaId,
      machineId: typeof rec.machineId === 'string' ? rec.machineId : null,
      name: typeof rec.name === 'string' ? rec.name : '',
    }
  } catch {
    return null
  }
}

// The worker signs a video callback under its own header (X-Cactus-Signature)
// with the same shared secret. Its own header rather than the sequence one so
// neither webhook can ever be handed the other's payload and asked to make
// sense of it.
export function verifyVideoCallbackSignature(rawBody: string, signature: string | null): boolean {
  const secret = getMediaWorkerSecret()
  if (!secret || !signature) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

// ---------------------------------------------------------------------------
// Job refs
// ---------------------------------------------------------------------------
//
// In per-machine mode the id handed to the browser (and stored on the job's
// notification) is `<machineId>:<workerJobId>`, so a later status poll knows
// which machine to ask - the worker keeps jobs in memory only, and with several
// machines running, an unrouted poll would land on the wrong one. Shared-worker
// mode uses the bare worker job id.

export function joinJobRef(machineId: string | null, jobId: string): string {
  return machineId ? `${machineId}:${jobId}` : jobId
}

export function splitJobRef(ref: string): { machineId: string | null; jobId: string } {
  const i = ref.indexOf(':')
  if (i === -1) return { machineId: null, jobId: ref }
  return { machineId: ref.slice(0, i), jobId: ref.slice(i + 1) }
}

// ---------------------------------------------------------------------------
// Worker HTTP client
// ---------------------------------------------------------------------------

export class VideoWorkerError extends Error {
  /** The worker's HTTP status when the failure came from a response. 404 means
   *  the worker has no record of the job - it restarted and lost it mid-encode. */
  readonly status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.status = status
  }
}

function workerBase(): string {
  const url = getMediaWorkerUrl()
  if (!url) throw new VideoWorkerError('The video service is not configured (MEDIA_WORKER_URL).')
  return url
}

function workerAuth(): string {
  const secret = getMediaWorkerSecret()
  if (!secret) throw new VideoWorkerError('The video service is not configured (MEDIA_WORKER_SECRET).')
  return `Bearer ${secret}`
}

function instanceHeaders(machineId: string | null | undefined): Record<string, string> {
  return machineId ? { 'fly-force-instance-id': machineId } : {}
}

export type EnqueueVideoArgs = {
  videoUrl: string
  /** Full destination object key, e.g. media/shop/chairs/eclipse/demo.mp4 */
  destKey: string
  name: string
  crf: number
  maxWidth: number
  maxFps: number
  callbackUrl: string
  callbackToken: string
}

export async function enqueueVideoJob(
  args: EnqueueVideoArgs,
  opts?: { machineId?: string | null },
): Promise<{ jobId: string }> {
  // A freshly created job machine reports 'started' a moment before uvicorn has
  // bound, so the first request can meet a refused connection or a proxy
  // 502/503. Those retry briefly; any other answer from the worker is final.
  const attempts = opts?.machineId ? 8 : 1
  let lastError: Error = new VideoWorkerError('The video service could not be reached.')
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000))
    let res: Response
    try {
      res = await fetch(`${workerBase()}/video-jobs`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: workerAuth(),
          ...instanceHeaders(opts?.machineId),
        },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(20_000),
      })
    } catch (err) {
      lastError = err instanceof Error ? err : new VideoWorkerError('The video service could not be reached.')
      continue
    }
    if (res.status === 502 || res.status === 503) {
      lastError = new VideoWorkerError(`The video service is still starting (HTTP ${res.status}).`)
      continue
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new VideoWorkerError(`The video service rejected the job (HTTP ${res.status}). ${detail.slice(0, 200)}`.trim())
    }
    const data = (await res.json().catch(() => null)) as { jobId?: unknown } | null
    const jobId = data && typeof data.jobId === 'string' ? data.jobId : ''
    if (!jobId) throw new VideoWorkerError('The video service did not return a job id.')
    return { jobId }
  }
  throw lastError
}

export type VideoJobResult = {
  key: string
  sizeBefore: number
  sizeAfter: number
  width: number
  height: number
  durationSeconds: number
  hasAudio: boolean
  optimised: boolean
  reason?: string
}

export type VideoJobStatus = {
  jobId: string
  status: 'queued' | 'running' | 'done' | 'error'
  progress: number
  error?: string
  result?: VideoJobResult
}

export async function getVideoJob(jobId: string, machineId?: string | null): Promise<VideoJobStatus> {
  const res = await fetch(`${workerBase()}/jobs/${encodeURIComponent(jobId)}`, {
    headers: { authorization: workerAuth(), ...instanceHeaders(machineId) },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new VideoWorkerError(`The video service status check failed (HTTP ${res.status}).`, res.status)
  return (await res.json()) as VideoJobStatus
}
