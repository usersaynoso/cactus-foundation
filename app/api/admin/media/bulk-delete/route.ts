import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { deleteMedia, getMediaReferences } from '@/lib/media/upload'

// Bulk companion to the per-id DELETE in ../[id]/route.ts — same reference
// check and force-override semantics, just applied to a list. Items still in
// use are skipped unless force is set; the rest are deleted regardless of any
// one item's outcome, and the response says which is which.
export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'media.delete')) return errorResponse('Forbidden', 403)

  const body = await request.json().catch(() => null)
  const ids: unknown = body?.ids
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string')) {
    return errorResponse('ids must be a non-empty array of media IDs')
  }
  const force = body?.force === true

  const deleted: string[] = []
  const skipped: { id: string; references: string[] }[] = []
  const notFound: string[] = []

  for (const id of ids) {
    const media = await prisma.media.findUnique({ where: { id } })
    if (!media) { notFound.push(id); continue }

    const refs = await getMediaReferences(id)
    if (refs.length > 0 && !force) {
      skipped.push({ id, references: refs })
      continue
    }

    await deleteMedia(media.provider, media.key)
    await prisma.media.delete({ where: { id } })
    deleted.push(id)
  }

  return NextResponse.json({ ok: true, deleted, skipped, notFound })
}
