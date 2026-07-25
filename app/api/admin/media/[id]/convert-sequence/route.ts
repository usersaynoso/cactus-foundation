import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { isVideoDirectType } from '@/lib/media/limits'
import { getSiteUrl, isSequenceWorkerConfigured } from '@/lib/config/env'
import { requireWorkerUrl } from '@/lib/media/upload'
import { buildDestPrefix, signSequenceContext, enqueueSequenceJob, SequenceWorkerError } from '@/lib/media/sequence'
import { upsertSequenceNotification } from '@/lib/notifications/alerts'

type Ctx = { params: Promise<{ id: string }> }

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
  const engine = body?.engine === 'birefnet' ? 'birefnet' : 'isnet'
  const fps =
    typeof body?.fps === 'number' && Number.isFinite(body.fps)
      ? Math.max(1, Math.min(60, Math.round(body.fps)))
      : undefined
  if (!name) return errorResponse('A sequence name is required.', 400)

  const destPrefix = buildDestPrefix(path, name)
  if (!destPrefix) return errorResponse('Enter a valid destination path and sequence name.', 400)

  // The worker fetches the source over the public media Worker URL. Video is not a
  // token-protected type, so the plain worker url is fetchable as-is.
  const videoUrl = `${requireWorkerUrl()}/${media.key}`
  const callbackUrl = `${getSiteUrl()}/api/webhooks/sequence`
  const callbackToken = signSequenceContext({ folderId, name })

  try {
    const { jobId } = await enqueueSequenceJob({
      videoUrl,
      destPrefix,
      sequenceName: name,
      fps,
      engine,
      callbackUrl,
      callbackToken,
    })
    await upsertSequenceNotification({ jobId, name, state: 'queued', progress: 0 })
    return NextResponse.json({ jobId, destPrefix })
  } catch (err) {
    if (err instanceof SequenceWorkerError) return errorResponse(err.message, 502)
    throw err
  }
}
