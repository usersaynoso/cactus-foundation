import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { deleteMediaBytes, getMediaReferences } from '@/lib/media/upload'
import { detachMediaReferences } from '@/lib/media/detach'
import { discardRenditionsOfDeleted } from '@/lib/media/renditions'

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

    // Forced through, so take the item off whatever held it before it goes -
    // otherwise every one of those surfaces is left naming a blob that is about
    // to stop existing. Skipped for an item nothing pointed at, which is the
    // whole of an Unused-tile sweep and is where the volume is.
    if (refs.length > 0) await detachMediaReferences(media)

    // And the item's own shrunk copies, referenced or not - a copy of a picture
    // that has gone is an orphan nothing can draw or find.
    await discardRenditionsOfDeleted(media)

    await deleteMediaBytes(media)
    await prisma.media.delete({ where: { id } })
    deleted.push(id)
  }

  return NextResponse.json({ ok: true, deleted, skipped, notFound })
}
