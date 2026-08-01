import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { getSequenceJob, splitJobRef, SequenceWorkerError } from '@/lib/media/sequence'
import { upsertSequenceNotification } from '@/lib/notifications/alerts'
import { prisma } from '@/lib/db/prisma'

// Progress poll for a running conversion. Proxies the worker's GET /jobs/{id} so
// the shared worker secret never reaches the browser. The finished library row is
// created by the callback, so this only reports status/progress for the UI.
//
// The jobId may be a `<machineId>:<workerJobId>` ref (per-job Fly machine mode);
// the machine part routes the poll to the machine actually running the job.

type TerminalState = { state: 'done' | 'error'; detail: string | null; name: string } | null

// What the job's notification already says, when that is final. In per-machine
// mode the machine is DESTROYED as soon as the completion webhook lands, so a
// poll a moment later cannot reach the worker any more - but the notification
// already holds the truth, and it must win over a dead-machine fetch error.
async function terminalFromNotification(jobRef: string): Promise<TerminalState> {
  const existing = await prisma.notification.findFirst({
    where: { dedupeKey: `sequence-job:${jobRef}` },
    select: { title: true, reasons: true },
  })
  if (!existing) return null
  const name = existing.title.replace(/^Scroll sequence (?:in progress|complete|failed): /, '')
  const reason = Array.isArray(existing.reasons) ? (existing.reasons[0] as { detail?: unknown } | undefined) : undefined
  const detail = reason && typeof reason.detail === 'string' ? reason.detail : null
  if (existing.title.startsWith('Scroll sequence complete:')) return { state: 'done', detail, name }
  if (existing.title.startsWith('Scroll sequence failed:')) return { state: 'error', detail, name }
  return null
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
    const job = await getSequenceJob(jobId, machineId)
    const existing = await prisma.notification.findFirst({
      where: { dedupeKey: `sequence-job:${jobRef}` },
      select: { title: true },
    })
    const title = existing?.title ?? `Scroll sequence in progress: ${jobRef}`
    await upsertSequenceNotification({
      jobId: jobRef,
      name: title.replace(/^Scroll sequence (?:in progress|complete|failed): /, ''),
      state: job.status,
      progress: job.progress,
      detail: job.error ?? undefined,
    })
    return NextResponse.json({ status: job.status, progress: job.progress, error: job.error ?? null })
  } catch (err) {
    // The worker keeps jobs in memory only, so a restart loses any job that was
    // in flight - it then answers 404 for that id forever. Nothing can revive it,
    // so mark the job Failed here rather than leaving it stuck at its last % (and
    // return that as the status, not a bare 502, so the poller reflects it).
    if (err instanceof SequenceWorkerError && err.status === 404) {
      const detail = 'The conversion service restarted and lost this job. Convert the video again.'
      const existing = await prisma.notification.findFirst({
        where: { dedupeKey: `sequence-job:${jobRef}` },
        select: { title: true },
      })
      const title = existing?.title ?? `Scroll sequence in progress: ${jobRef}`
      await upsertSequenceNotification({
        jobId: jobRef,
        name: title.replace(/^Scroll sequence (?:in progress|complete|failed): /, ''),
        state: 'error',
        detail,
      })
      return NextResponse.json({ status: 'error', progress: null, error: detail })
    }
    if (err instanceof SequenceWorkerError) return errorResponse(err.message, 502)
    throw err
  }
}
