import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getActiveMediaProvider } from '@/lib/config/env'
import { SEQUENCE_MIME } from '@/lib/media/limits'
import { saveMediaRecord } from '@/lib/media/upload'
import { verifyCallbackSignature, verifySequenceContext, joinJobRef } from '@/lib/media/sequence'
import { upsertSequenceNotification } from '@/lib/notifications/alerts'
import { resolveSequenceFly } from '@/lib/media/sequence-presets'
import { destroyJobMachine } from '@/lib/media/fly-machines'

// The job's Fly machine has done its work the moment this callback arrives -
// destroy it so it stops billing. Best-effort: the machine also destroys itself
// once idle (SELF_DESTROY + auto_destroy), so a failure here only costs a few
// idle minutes, never a stranded machine.
async function destroyMachine(machineId: string): Promise<void> {
  const fly = await resolveSequenceFly()
  if (!fly) return
  await destroyJobMachine(fly, machineId).catch(() => {})
}

// Completion callback from the sequence worker. Not session-authenticated (the
// worker holds no cookie) but HMAC-gated: the body is signed with the shared
// worker secret, which only our worker knows. On a completed job this records the
// single "scroll sequence" pointer row - the frames themselves already sit in
// object storage. Idempotent on the manifest key, so a retried callback is a
// no-op. Lives under /api/webhooks/ so the edge middleware always lets it through.
export async function POST(request: NextRequest) {
  const raw = await request.text()
  if (!verifyCallbackSignature(raw, request.headers.get('x-sequence-signature'))) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  // Folder + display name ride the callbackToken we signed at enqueue time.
  const auth = request.headers.get('authorization') ?? ''
  const ctx = verifySequenceContext(auth.startsWith('Bearer ') ? auth.slice(7) : '')

  // Anything other than a completed job carries no manifest to record. A failure
  // still needs to land on the job's notification though: the admin has very
  // likely closed the modal (the whole point of the notification), so the status
  // poll that would otherwise surface the error is long gone. Mark the persistent
  // notification failed here so a walked-away admin sees the real outcome, then
  // ack either way so the worker stops retrying.
  // The notification is keyed on the ref the browser tracks: in per-machine mode
  // that is `<machineId>:<workerJobId>` (see joinJobRef), so recompose it here.
  const machineId = ctx?.machineId ?? null

  if (body.status !== 'done') {
    if (body.status === 'error' || body.status === 'failed') {
      const failedJobId = typeof body.jobId === 'string' ? body.jobId : ''
      const failedName = typeof body.sequenceName === 'string' && body.sequenceName.trim()
        ? body.sequenceName.trim()
        : ctx?.name || 'Scroll sequence'
      const detail = typeof body.error === 'string' && body.error ? body.error : undefined
      if (failedJobId) {
        await upsertSequenceNotification({ jobId: joinJobRef(machineId, failedJobId), name: failedName, state: 'error', detail }).catch(() => {})
      }
      // Failed or done, the job is over - its machine goes either way. After the
      // notification write, so a status poll never sees a dead machine before a
      // settled notification.
      if (machineId) await destroyMachine(machineId)
    }
    return NextResponse.json({ ok: true, recorded: false })
  }

  const manifestKey = typeof body.manifestKey === 'string' ? body.manifestKey : ''
  if (!manifestKey) return NextResponse.json({ error: 'missing manifestKey' }, { status: 400 })
  const jobId = typeof body.jobId === 'string' ? body.jobId : ''
  const sequenceName = typeof body.sequenceName === 'string' && body.sequenceName.trim()
    ? body.sequenceName.trim()
    : ctx?.name || manifestKey.split('/').slice(-2, -1)[0] || 'Scroll sequence'

  const provider = await getActiveMediaProvider()
  if (!provider) return NextResponse.json({ error: 'no media provider configured' }, { status: 503 })

  // Idempotent: a retried callback must not mint a duplicate row. The manifest
  // key is unique per sequence.
  const existing = await prisma.media.findUnique({ where: { key: manifestKey } })
  if (existing) return NextResponse.json({ ok: true, recorded: false, mediaId: existing.id })

  // Fall back to the folder segment above manifest.json for a name if the token
  // was somehow absent - the HMAC has already proved the callback genuine.
  const name = sequenceName

  const record = await saveMediaRecord({
    key: manifestKey,
    url: '', // saveMediaRecord rebuilds the Worker url for proxied providers
    provider,
    mimeType: SEQUENCE_MIME,
    sizeBytes: 0,
    originalName: name,
    folderId: ctx?.folderId ?? null,
  })
  if (jobId) {
    await upsertSequenceNotification({
      jobId: joinJobRef(machineId, jobId),
      name,
      state: 'done',
      progress: 1,
    }).catch(() => {})
  }
  if (machineId) await destroyMachine(machineId)
  return NextResponse.json({ ok: true, recorded: true, mediaId: record.id })
}
