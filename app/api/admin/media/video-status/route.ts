import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { splitJobRef } from '@/lib/media/video-optimise'
import { getVideoJob, VideoWorkerError } from '@/lib/media/video-optimise'
import { getJobMachineState } from '@/lib/media/fly-machines'
import { resolveMediaWorkerFly } from '@/lib/media/media-worker-config'
import { upsertVideoJobNotification } from '@/lib/notifications/alerts'
import { videoNameFromTitle } from '@/lib/media/video-job-notification'
import { prisma } from '@/lib/db/prisma'

// Progress poll for a running video optimise. Proxies the worker's GET /jobs/{id}
// so the shared worker secret never reaches the browser. The media row itself is
// updated by the callback, so this only reports status/progress for the UI.
//
// The jobId may be a `<machineId>:<workerJobId>` ref (per-job Fly machine mode);
// the machine part routes the poll to the machine actually running the job.

type TerminalState = { state: 'done' | 'error'; detail: string | null; name: string } | null

// What the job's notification already says, when that is final. The job's
// machine is DESTROYED as soon as the completion webhook lands, so a poll a
// moment later cannot reach the worker any more - but the notification already
// holds the truth, and it must win over a dead-machine fetch error.
async function terminalFromNotification(jobRef: string): Promise<TerminalState> {
  const existing = await prisma.notification.findFirst({
    where: { dedupeKey: `video-job:${jobRef}` },
    select: { title: true, reasons: true },
  })
  if (!existing) return null
  const name = videoNameFromTitle(existing.title)
  const reason = Array.isArray(existing.reasons) ? (existing.reasons[0] as { detail?: unknown } | undefined) : undefined
  const detail = reason && typeof reason.detail === 'string' ? reason.detail : null
  if (existing.title.startsWith('Video optimised:')) return { state: 'done', detail, name }
  if (existing.title.startsWith('Video optimise failed:')) return { state: 'error', detail, name }
  return null
}

async function nameForJob(jobRef: string): Promise<string> {
  const existing = await prisma.notification.findFirst({
    where: { dedupeKey: `video-job:${jobRef}` },
    select: { title: true },
  })
  return existing ? videoNameFromTitle(existing.title) : jobRef
}

export async function GET(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!(await hasPermission(user, 'media.upload'))) return errorResponse('Forbidden', 403)

  const jobRef = request.nextUrl.searchParams.get('jobId') ?? ''
  if (!jobRef) return errorResponse('jobId is required', 400)
  const { machineId, jobId } = splitJobRef(jobRef)

  // A job the webhook has already settled needs no worker round-trip.
  const settled = await terminalFromNotification(jobRef)
  if (settled) {
    return NextResponse.json({
      status: settled.state,
      progress: settled.state === 'done' ? 1 : null,
      error: settled.state === 'error' ? settled.detail : null,
    })
  }

  try {
    const job = await getVideoJob(jobId, machineId)
    await upsertVideoJobNotification({
      jobId: jobRef,
      name: await nameForJob(jobRef),
      state: job.status,
      progress: job.progress,
      detail: job.error ?? undefined,
    })
    return NextResponse.json({ status: job.status, progress: job.progress, error: job.error ?? null })
  } catch (err) {
    // The worker keeps jobs in memory only, so a restart loses any job in
    // flight - it then answers 404 for that id forever. Nothing can revive it,
    // so mark the job failed here rather than leaving it stuck at its last %.
    if (err instanceof VideoWorkerError && err.status === 404) {
      // ...unless the job has a machine of its own and that machine is still up,
      // in which case the 404 came from a poll the Fly proxy routed past the
      // forced instance, and failing the job on that evidence would kill an
      // encode that is quietly getting on with it.
      if (machineId) {
        const fly = await resolveMediaWorkerFly()
        const state = fly ? await getJobMachineState(fly, machineId).catch(() => null) : null
        if (state && state !== 'destroyed') {
          return NextResponse.json({ status: 'running', progress: null, error: null })
        }
      }
      const detail = 'The video service restarted and lost this job. Optimise the video again.'
      await upsertVideoJobNotification({
        jobId: jobRef,
        name: await nameForJob(jobRef),
        state: 'error',
        detail,
      })
      return NextResponse.json({ status: 'error', progress: null, error: detail })
    }
    if (err instanceof VideoWorkerError) return errorResponse(err.message, 502)
    throw err
  }
}
