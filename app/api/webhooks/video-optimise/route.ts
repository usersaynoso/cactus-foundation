import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { applyOptimisedVideo, markVideoAlreadyOptimised } from '@/lib/media/upload'
import { verifyVideoCallbackSignature, verifyVideoContext } from '@/lib/media/video-optimise'
import { joinJobRef } from '@/lib/media/video-optimise'
import { upsertVideoJobNotification } from '@/lib/notifications/alerts'
import { resolveMediaWorkerFly } from '@/lib/media/media-worker-config'
import { destroyJobMachine } from '@/lib/media/fly-machines'

// The job's Fly machine has done its work the moment this callback arrives -
// destroy it so it stops billing. Best-effort: the machine also destroys itself
// once idle (SELF_DESTROY + auto_destroy), so a failure here only costs a few
// idle minutes, never a stranded machine.
async function destroyMachine(machineId: string): Promise<void> {
  const fly = await resolveMediaWorkerFly()
  if (!fly) return
  await destroyJobMachine(fly, machineId).catch(() => {})
}

function readNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null
}

// A file weight in the plainest words available - the notification is read on a
// phone by someone who wants to know whether it was worth it.
function describeSaving(before: number, after: number): string {
  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`
  const saved = Math.max(0, Math.round((1 - after / before) * 100))
  return `${mb(before)} → ${mb(after)}, ${saved}% smaller`
}

// Completion callback from the media worker's video optimiser. Not session-
// authenticated (the worker holds no cookie) but HMAC-gated: the body is signed
// with the shared worker secret, which only our worker knows. On a completed job
// this points the existing library row at the file the worker has already
// written - same row id, so every reference to the video survives. Idempotent:
// a retried callback repeats a write that lands on the same values. Lives under
// /api/webhooks/ so the edge middleware always lets it through.
export async function POST(request: NextRequest) {
  const raw = await request.text()
  if (!verifyVideoCallbackSignature(raw, request.headers.get('x-cactus-signature'))) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  // Which library row this job belongs to rides the callbackToken we signed at
  // enqueue time; the machine id rides along so the machine can be shut down.
  const auth = request.headers.get('authorization') ?? ''
  const ctx = verifyVideoContext(auth.startsWith('Bearer ') ? auth.slice(7) : '')
  const machineId = ctx?.machineId ?? null
  const jobId = typeof body.jobId === 'string' ? body.jobId : ''
  const jobRef = joinJobRef(machineId, jobId)
  const name = ctx?.name || (typeof body.name === 'string' ? body.name : '') || 'Video'

  if (body.status !== 'done') {
    const detail = typeof body.error === 'string' && body.error ? body.error : undefined
    if (jobId) {
      await upsertVideoJobNotification({ jobId: jobRef, name, state: 'error', detail }).catch(() => {})
    }
    // Failed or done, the job is over - its machine goes either way. After the
    // notification write, so a status poll never sees a dead machine before a
    // settled notification.
    if (machineId) await destroyMachine(machineId)
    return NextResponse.json({ ok: true, recorded: false })
  }

  if (!ctx) return NextResponse.json({ error: 'missing job context' }, { status: 400 })

  const key = typeof body.key === 'string' ? body.key : ''
  const sizeBefore = readNumber(body.sizeBefore)
  const sizeAfter = readNumber(body.sizeAfter)
  const optimised = body.optimised === true

  const media = await prisma.media.findUnique({ where: { id: ctx.mediaId }, select: { id: true, folderId: true } })
  if (!media) {
    // The row was deleted while the encode ran. Nothing to point anywhere; say
    // so on the notification rather than leaving it stuck at 90%.
    await upsertVideoJobNotification({
      jobId: jobRef,
      name,
      state: 'error',
      detail: 'That video was deleted while it was being optimised.',
    }).catch(() => {})
    if (machineId) await destroyMachine(machineId)
    return NextResponse.json({ ok: true, recorded: false })
  }

  if (!optimised || !key || sizeAfter === null) {
    // The worker beat nothing, so it uploaded nothing. Mark the item done so the
    // library stops offering an optimise that has already been tried and found
    // pointless.
    await markVideoAlreadyOptimised(ctx.mediaId)
    await upsertVideoJobNotification({
      jobId: jobRef,
      name,
      state: 'done',
      progress: 1,
      detail: typeof body.reason === 'string' && body.reason ? body.reason : 'Already as small as it gets',
      folderId: media.folderId ?? null,
    }).catch(() => {})
    if (machineId) await destroyMachine(machineId)
    return NextResponse.json({ ok: true, recorded: false })
  }

  const updated = await applyOptimisedVideo(ctx.mediaId, { key, sizeBytes: sizeAfter })
  await upsertVideoJobNotification({
    jobId: jobRef,
    name,
    state: 'done',
    progress: 1,
    detail: sizeBefore ? describeSaving(sizeBefore, sizeAfter) : undefined,
    folderId: updated?.folderId ?? media.folderId ?? null,
  }).catch(() => {})
  if (machineId) await destroyMachine(machineId)
  return NextResponse.json({ ok: true, recorded: true, mediaId: ctx.mediaId })
}
