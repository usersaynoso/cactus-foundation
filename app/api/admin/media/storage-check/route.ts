import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { deleteMedia } from '@/lib/media/upload'
import { reconcileMediaStorage, correctRecordedSizes } from '@/lib/media/reconcile'

// Compare the media library against what storage actually holds, and repair the
// two drifts that are safe to repair. Slow by nature - it lists every object the
// providers hold - so it is on demand from the media page, never part of a page
// render.
export const maxDuration = 60

// GET: the scan. Read-only, and gated on config.manage rather than the media.*
// pair because it reports on storage as a whole, including objects no media item
// claims.
export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'config.manage')) return errorResponse('Forbidden', 403)

  try {
    return NextResponse.json(await reconcileMediaStorage())
  } catch (err: unknown) {
    return errorResponse(`Storage check failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 500)
  }
}

// POST: the repairs.
//
//   { action: 'correct-sizes' }              - rewrites recorded sizes to match
//                                              the objects. Changes no file.
//   { action: 'delete-orphans', keys: [] }   - deletes objects with no media
//                                              item. Destructive, and no
//                                              reference check can vouch for an
//                                              object nothing in the database
//                                              points at, so it needs the delete
//                                              permission as well and only ever
//                                              acts on keys a fresh scan still
//                                              calls orphaned.
export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'config.manage')) return errorResponse('Forbidden', 403)

  const body = await request.json().catch(() => null)
  const action = typeof body?.action === 'string' ? body.action : ''

  try {
    if (action === 'correct-sizes') {
      return NextResponse.json(await correctRecordedSizes())
    }

    if (action === 'delete-orphans') {
      if (!await hasPermission(user, 'media.delete')) return errorResponse('Forbidden', 403)

      const requested = Array.isArray(body?.keys) ? body.keys.filter((k: unknown) => typeof k === 'string') as string[] : []
      if (requested.length === 0) return errorResponse('No files selected')

      // The client's list is a selection, not an authority. Re-scanning here is
      // what stops a stale page (or a crafted request) deleting an object that
      // has since been claimed by a media item.
      const { orphaned } = await reconcileMediaStorage()
      const byKey = new Map(orphaned.map((o) => [o.key, o]))

      const deleted: string[] = []
      const skipped: string[] = []
      let reclaimedBytes = 0
      for (const key of requested) {
        const target = byKey.get(key)
        if (!target) { skipped.push(key); continue }
        try {
          await deleteMedia(target.provider, target.key)
          deleted.push(key)
          reclaimedBytes += target.sizeBytes
        } catch {
          skipped.push(key)
        }
      }
      return NextResponse.json({ deleted: deleted.length, skipped: skipped.length, reclaimedBytes })
    }

    return errorResponse('Unknown action')
  } catch (err: unknown) {
    return errorResponse(`Storage check failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 500)
  }
}
