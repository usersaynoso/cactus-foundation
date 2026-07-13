import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { deleteMedia, getMediaReferences } from '@/lib/media/upload'
import { moveOrRenameMedia, MediaNameCollisionError, type CollisionMode } from '@/lib/media/organise'

type Ctx = { params: Promise<{ id: string }> }

// Rename and/or move a single item. Body: { newName?, targetFolderId?, collision? }.
// A name clash under the default 'error' mode returns 409 { collision, name } so
// the client can offer keep-both / replace / skip.
//
// Metadata-only edits (alt text, decorative flag) are handled up front as a plain
// update - these never collide, so they skip the move/rename path entirely.
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'media.upload')) return errorResponse('Forbidden', 403)

  const { id } = await params
  if (!id) return errorResponse('Media ID required')

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return errorResponse('Invalid body')

  // Alt text / decorative flag: a self-contained metadata edit.
  const isMetadataEdit = 'altText' in body || 'isDecorative' in body
  if (isMetadataEdit && !('newName' in body) && !('targetFolderId' in body)) {
    const data: { altText?: string | null; isDecorative?: boolean } = {}
    if ('altText' in body) {
      if (body.altText !== null && typeof body.altText !== 'string') return errorResponse('altText must be a string or null')
      const trimmed = typeof body.altText === 'string' ? body.altText.trim() : null
      data.altText = trimmed ? trimmed : null
    }
    if ('isDecorative' in body) {
      if (typeof body.isDecorative !== 'boolean') return errorResponse('isDecorative must be a boolean')
      data.isDecorative = body.isDecorative
    }
    // A decorative image must carry no alt text - keep the two consistent.
    if (data.isDecorative === true) data.altText = null
    const exists = await prisma.media.findUnique({ where: { id }, select: { id: true } })
    if (!exists) return errorResponse('Not found', 404)
    const updated = await prisma.media.update({ where: { id }, data })
    return NextResponse.json({ ok: true, item: updated })
  }

  const opts: { targetFolderId?: string | null; newName?: string; collision?: CollisionMode } = {}
  if ('targetFolderId' in body) {
    const t = body.targetFolderId
    if (t !== null && typeof t !== 'string') return errorResponse('targetFolderId must be a string or null')
    opts.targetFolderId = t
  }
  if ('newName' in body) {
    if (typeof body.newName !== 'string' || !body.newName.trim()) return errorResponse('newName must be a non-empty string')
    opts.newName = body.newName.trim()
  }
  if (typeof body.collision === 'string') opts.collision = body.collision as CollisionMode

  try {
    const updated = await moveOrRenameMedia(id, opts)
    return NextResponse.json({ ok: true, item: updated, skipped: updated === null })
  } catch (err: unknown) {
    if (err instanceof MediaNameCollisionError) {
      return NextResponse.json({ error: err.message, collision: true, name: err.collidingName }, { status: 409 })
    }
    return errorResponse(err instanceof Error ? err.message : 'Update failed', 500)
  }
}

// Mirrors the DELETE handler in ../route.ts (query-param form), for the
// MediaDelete component which calls DELETE /api/admin/media/<id> as a path param.
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'media.delete')) return errorResponse('Forbidden', 403)

  const { id } = await params
  if (!id) return errorResponse('Media ID required')

  const media = await prisma.media.findUnique({ where: { id } })
  if (!media) return errorResponse('Not found', 404)

  // Check references — warn if the item is still in use
  const refs = await getMediaReferences(id)
  if (refs.length > 0) {
    const force = request.nextUrl.searchParams.get('force') === 'true'
    if (!force) {
      return NextResponse.json(
        { error: 'This media item is still in use', references: refs },
        { status: 409 }
      )
    }
  }

  // Delete from the provider the row actually lives on (not the active selection).
  await deleteMedia(media.provider, media.key)
  await prisma.media.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
