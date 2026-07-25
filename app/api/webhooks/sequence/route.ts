import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getActiveMediaProvider } from '@/lib/config/env'
import { SEQUENCE_MIME } from '@/lib/media/limits'
import { saveMediaRecord } from '@/lib/media/upload'
import { verifyCallbackSignature, verifySequenceContext } from '@/lib/media/sequence'

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

  // Anything other than a completed job carries no manifest to record. Ack it so
  // the worker stops retrying; the failure is already visible via the status poll.
  if (body.status !== 'done') {
    return NextResponse.json({ ok: true, recorded: false })
  }

  const manifestKey = typeof body.manifestKey === 'string' ? body.manifestKey : ''
  if (!manifestKey) return NextResponse.json({ error: 'missing manifestKey' }, { status: 400 })

  const provider = await getActiveMediaProvider()
  if (!provider) return NextResponse.json({ error: 'no media provider configured' }, { status: 503 })

  // Idempotent: a retried callback must not mint a duplicate row. The manifest
  // key is unique per sequence.
  const existing = await prisma.media.findUnique({ where: { key: manifestKey } })
  if (existing) return NextResponse.json({ ok: true, recorded: false, mediaId: existing.id })

  // Fall back to the folder segment above manifest.json for a name if the token
  // was somehow absent - the HMAC has already proved the callback genuine.
  const name = ctx?.name || manifestKey.split('/').slice(-2, -1)[0] || 'Scroll sequence'

  const record = await saveMediaRecord({
    key: manifestKey,
    url: '', // saveMediaRecord rebuilds the Worker url for proxied providers
    provider,
    mimeType: SEQUENCE_MIME,
    sizeBytes: 0,
    originalName: name,
    folderId: ctx?.folderId ?? null,
  })
  return NextResponse.json({ ok: true, recorded: true, mediaId: record.id })
}
