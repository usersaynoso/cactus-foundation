import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { isVideoDirectType } from '@/lib/media/limits'
import { getSiteUrl, isSequenceWorkerConfigured } from '@/lib/config/env'
import { requireWorkerUrl } from '@/lib/media/upload'
import { buildDestPrefix, signSequenceContext, enqueueSequenceJob, joinJobRef, SequenceWorkerError } from '@/lib/media/sequence'
import { upsertSequenceNotification } from '@/lib/notifications/alerts'
import { getSequenceConfig, resolveFlyFromConfig } from '@/lib/media/sequence-presets'
import { createJobMachine, destroyJobMachine, FlyMachinesError } from '@/lib/media/fly-machines'

type Ctx = { params: Promise<{ id: string }> }

// A finite, non-negative number of seconds, or undefined when absent/invalid.
function readSeconds(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return undefined
  return v
}

// Creating a per-job Fly machine and waiting for it to boot can take a good
// twenty seconds - past the default function ceiling.
export const maxDuration = 60

// Kick off a video -> transparent scroll-sequence conversion on the sequence
// worker. Returns a jobId the client polls via ../sequence-status; the finished
// sequence's library row is created by the worker's callback (/api/webhooks/
// sequence), because the job outlives the admin's tab by a good quarter of an hour.
export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!(await hasPermission(user, 'media.upload'))) return errorResponse('Forbidden', 403)
  if (!isSequenceWorkerConfigured()) {
    return errorResponse('The video conversion service is not configured. Set SEQUENCE_WORKER_URL and SEQUENCE_WORKER_SECRET.', 503)
  }

  const { id } = await params
  const media = await prisma.media.findUnique({ where: { id } })
  if (!media) return errorResponse('Media item not found', 404)
  if (!isVideoDirectType(media.mimeType)) {
    return errorResponse('Only video items (MP4 or WebM) can be converted to a scroll sequence.', 400)
  }

  const body = await request.json().catch(() => null)
  const path = typeof body?.path === 'string' ? body.path : ''
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const folderId = typeof body?.folderId === 'string' && body.folderId ? body.folderId : null
  if (!name) return errorResponse('A sequence name is required.', 400)

  // Optional trim window (seconds). The browser sends numbers it parsed from
  // the dialog's time fields; re-validated here so a hand-rolled request can't
  // hand the worker nonsense.
  const trimStart = readSeconds(body?.trimStart)
  const trimEnd = readSeconds(body?.trimEnd)
  if (body?.trimStart != null && trimStart === undefined) return errorResponse('The start time must be a number of seconds, zero or more.', 400)
  if (body?.trimEnd != null && trimEnd === undefined) return errorResponse('The end time must be a number of seconds greater than zero.', 400)
  if (trimEnd !== undefined && trimEnd <= 0) return errorResponse('The end time must be greater than zero.', 400)
  if (trimStart !== undefined && trimEnd !== undefined && trimEnd <= trimStart) {
    return errorResponse('The end time must be after the start time.', 400)
  }

  // The engine, frame rate and max width are not the browser's to choose: they
  // come from the admin-tuned settings (Media > Scroll sequences). Everything
  // numeric is read server-side, so a conversion always runs exactly what the
  // settings say.
  const config = await getSequenceConfig()
  const settings = config.settings

  const destPrefix = buildDestPrefix(path, name)
  if (!destPrefix) return errorResponse('Enter a valid destination path and sequence name.', 400)

  // The worker fetches the source over the public media Worker URL. Video is not a
  // token-protected type, so the plain worker url is fetchable as-is.
  const videoUrl = `${requireWorkerUrl()}/${media.key}`
  const callbackUrl = `${getSiteUrl()}/api/webhooks/sequence`

  // With a Fly token configured, this job gets its own machine so several
  // conversions run at once; the machine is destroyed when the job finishes
  // (webhook, with the worker's own idle self-destruct as the safety net). At
  // the parallel cap - or with no token at all - the job posts to the shared
  // worker URL and queues, exactly the old behaviour.
  const { fly } = resolveFlyFromConfig(config)
  let machineId: string | null = null
  if (fly) {
    try {
      machineId = await createJobMachine(fly)
    } catch (err) {
      if (err instanceof FlyMachinesError) return errorResponse(err.message, 502)
      throw err
    }
  }

  const callbackToken = signSequenceContext({ folderId, name, machineId })

  try {
    const { jobId } = await enqueueSequenceJob(
      {
        videoUrl,
        destPrefix,
        sequenceName: name,
        fps: settings.fps,
        maxWidth: settings.maxWidth,
        engine: settings.engine,
        trimStart,
        trimEnd,
        callbackUrl,
        callbackToken,
      },
      { machineId },
    )
    const jobRef = joinJobRef(machineId, jobId)
    await upsertSequenceNotification({ jobId: jobRef, name, state: 'queued', progress: 0 })
    return NextResponse.json({ jobId: jobRef, destPrefix })
  } catch (err) {
    // Never strand a machine the job could not reach.
    if (fly && machineId) await destroyJobMachine(fly, machineId).catch(() => {})
    if (err instanceof SequenceWorkerError) return errorResponse(err.message, 502)
    throw err
  }
}
