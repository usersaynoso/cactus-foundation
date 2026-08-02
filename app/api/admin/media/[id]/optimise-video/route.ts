import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { isVideoDirectType } from '@/lib/media/limits'
import { getSiteUrl, isMediaWorkerConfigured } from '@/lib/config/env'
import { requireWorkerUrl } from '@/lib/media/upload'
import { joinJobRef } from '@/lib/media/video-optimise'
import { enqueueVideoJob, signVideoContext, VideoWorkerError } from '@/lib/media/video-optimise'
import {
  DEFAULT_VIDEO_MAX_FPS,
  DEFAULT_VIDEO_MAX_WIDTH,
  DEFAULT_VIDEO_QUALITY,
  VIDEO_WIDTH_CHOICES,
  crfForQuality,
  isVideoQualityLevel,
  optimisedVideoKey,
} from '@/lib/media/video-quality'
import { upsertVideoJobNotification } from '@/lib/notifications/alerts'
import { getMediaWorkerConfig, resolveFlyFromConfig } from '@/lib/media/media-worker-config'
import { createJobMachine, destroyJobMachine, FlyMachinesError } from '@/lib/media/fly-machines'

type Ctx = { params: Promise<{ id: string }> }

// Creating a per-job Fly machine and waiting for it to boot can take a good
// twenty seconds - past the default function ceiling.
export const maxDuration = 60

// Kick off a video -> optimised MP4 re-encode on the media worker. Returns a
// jobId the client polls via ../../video-status; the media row is updated by the
// worker's callback (/api/webhooks/video-optimise), because a re-encode outlives
// the admin's patience for watching a progress bar.
export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!(await hasPermission(user, 'media.upload'))) return errorResponse('Forbidden', 403)
  if (!isMediaWorkerConfigured()) {
    return errorResponse('The video service is not configured. Set MEDIA_WORKER_URL and MEDIA_WORKER_SECRET.', 503)
  }

  const { id } = await params
  const media = await prisma.media.findUnique({ where: { id } })
  if (!media) return errorResponse('Media item not found', 404)
  if (!isVideoDirectType(media.mimeType)) {
    return errorResponse('Only video items (MP4 or WebM) can be optimised this way.', 400)
  }
  // The worker writes the finished file straight into the platform's Backblaze
  // bucket with its own credentials. On any other provider it would write into
  // thin air, so this is refused in plain words rather than attempted and
  // half-done.
  if (media.provider !== 'B2') {
    return errorResponse('Video optimising needs Backblaze B2 storage, which this site is not using.', 400)
  }

  const body = await request.json().catch(() => null)
  const quality = isVideoQualityLevel(body?.quality) ? body.quality : DEFAULT_VIDEO_QUALITY
  const maxWidth = (VIDEO_WIDTH_CHOICES as readonly number[]).includes(body?.maxWidth)
    ? (body.maxWidth as number)
    : DEFAULT_VIDEO_MAX_WIDTH

  // An .mp4 is written back over its own key so nothing pointing at it has to
  // learn a new address; a .webm has to move, because the extension is what
  // types the bytes for the media Worker. A move needs the destination free.
  const destKey = optimisedVideoKey(media.key)
  if (destKey !== media.key) {
    const taken = await prisma.media.findUnique({ where: { key: destKey }, select: { id: true } })
    if (taken) {
      return errorResponse('There is already a file with that name in MP4 form. Rename one of them and try again.', 409)
    }
  }

  const name = media.originalName?.trim() || media.key.split('/').pop() || 'Video'

  // The worker fetches the source over the public media Worker url. Video is not
  // a token-protected type, so the plain worker url is fetchable as-is.
  const videoUrl = `${requireWorkerUrl()}/${media.key}`
  const callbackUrl = `${getSiteUrl()}/api/webhooks/video-optimise`

  // With a Fly token configured every job gets a machine of its own - so a whole
  // selection encodes at once and each machine dies with its job - and without
  // one everything queues on the single shared worker.
  const config = await getMediaWorkerConfig()
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

  const callbackToken = signVideoContext({ mediaId: media.id, machineId, name })

  try {
    const { jobId } = await enqueueVideoJob(
      {
        videoUrl,
        destKey,
        name,
        crf: crfForQuality(quality),
        maxWidth,
        maxFps: DEFAULT_VIDEO_MAX_FPS,
        callbackUrl,
        callbackToken,
      },
      { machineId },
    )
    const jobRef = joinJobRef(machineId, jobId)
    await upsertVideoJobNotification({ jobId: jobRef, name, state: 'queued', progress: 0 })
    return NextResponse.json({ jobId: jobRef, destKey })
  } catch (err) {
    // Never strand a machine the job could not reach.
    if (fly && machineId) await destroyJobMachine(fly, machineId).catch(() => {})
    if (err instanceof VideoWorkerError) return errorResponse(err.message, 502)
    throw err
  }
}
