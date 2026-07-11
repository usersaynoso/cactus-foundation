import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { moveOrRenameMedia, MediaNameCollisionError, type CollisionMode } from '@/lib/media/organise'

// POST — move a batch of items into a folder. Body: { ids, targetFolderId, collision? }.
// With the default 'error' collision mode, the first clashing item stops the run
// and returns 409 { collision, name, id } so the client can prompt once, then
// retry with the chosen mode. 'suffix'/'replace'/'skip' resolve clashes inline.
export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'media.upload')) return errorResponse('Forbidden', 403)

  const body = await request.json().catch(() => null)
  const ids: unknown = body?.ids
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((i) => typeof i === 'string')) {
    return errorResponse('ids must be a non-empty array of media IDs')
  }
  const targetFolderId = body?.targetFolderId
  if (targetFolderId !== null && typeof targetFolderId !== 'string') {
    return errorResponse('targetFolderId must be a folder ID or null')
  }
  const collision: CollisionMode = typeof body?.collision === 'string' ? body.collision : 'error'

  const moved: string[] = []
  const skipped: string[] = []

  for (const id of ids as string[]) {
    try {
      const result = await moveOrRenameMedia(id, { targetFolderId, collision })
      if (result === null) skipped.push(id)
      else moved.push(id)
    } catch (err: unknown) {
      if (err instanceof MediaNameCollisionError) {
        return NextResponse.json(
          { error: err.message, collision: true, name: err.collidingName, id, moved, skipped },
          { status: 409 },
        )
      }
      return errorResponse(err instanceof Error ? err.message : 'Move failed', 500)
    }
  }

  return NextResponse.json({ ok: true, moved, skipped })
}
