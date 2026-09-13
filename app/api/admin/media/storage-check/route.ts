import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { MediaProviderType } from '@prisma/client'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import {
  adoptClaimedObjects,
  correctRecordedSizes,
  decodeScanCursor,
  deleteOrphanedObjects,
  purgeMissingRows,
  scanMediaStorageChunk,
} from '@/lib/media/reconcile'

// Compare the media library against what storage actually holds, and repair the
// drifts that are safe to repair. Slow by nature - it lists every object the
// providers hold - so it is on demand from the media page, never part of a page
// render.
export const maxDuration = 60

// GET: one slice of the scan. Read-only, and gated on config.manage rather than
// the media.* pair because it reports on storage as a whole, including objects no
// media item claims.
//
//   ?cursor=<string>   - where to carry on from: the `next` of the previous
//                        slice. Omitted, the scan starts at the beginning. A
//                        slice whose `next` is null is the last one.
//
// A big bucket does not fit in one request's time limit, so the page walks the
// slices and adds them up; each one is a complete report for its own key range.
export async function GET(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'config.manage')) return errorResponse('Forbidden', 403)

  const raw = request.nextUrl.searchParams.get('cursor')
  const cursor = raw === null ? null : decodeScanCursor(raw)
  if (raw !== null && cursor === null) return errorResponse('That check has lost its place. Run it again from the start.')

  try {
    return NextResponse.json(await scanMediaStorageChunk(cursor))
  } catch (err: unknown) {
    return errorResponse(`Storage check failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 500)
  }
}

// POST: the repairs. Each takes `items`, the objects to act on as the scan
// listed them ({ provider, key }), and acts only on those that still qualify when
// looked up afresh - the client's list is a selection, never an authority. The
// page sends them in batches; a batch is capped here so no single request can
// outgrow the route's time limit.
//
//   correct-sizes    - rewrites recorded sizes to match the objects. Changes no
//                      file.
//   delete-orphans   - deletes objects with no media item and nothing pointing at
//                      them. Destructive, so it needs the delete permission as
//                      well. The fresh lookup is also what keeps an object a
//                      module is using out of reach: it reads as claimed, never
//                      orphaned, so a stale page asking for one is simply skipped.
//   adopt-claimed    - gives a library entry to objects the site is using that
//                      the library has never heard of. Writes rows, touches no
//                      file, so it needs the upload permission rather than the
//                      delete one. A module's private files are never claimed,
//                      so they cannot be adopted by asking for them here.
//   purge-missing    - removes library entries whose file is no longer in
//     (force?)         storage. Deletes no blob (there isn't one left), but it
//                      does delete rows, so it needs the delete permission too.
//                      Entries something still points at are skipped and listed
//                      back unless force is set.
const MAX_ITEMS_PER_REQUEST = 500

const items = z
  .array(z.object({ provider: z.nativeEnum(MediaProviderType), key: z.string().min(1).max(2048) }))
  .min(1, 'Nothing was selected.')
  .max(MAX_ITEMS_PER_REQUEST, `No more than ${MAX_ITEMS_PER_REQUEST} at a time.`)

const repairSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('correct-sizes'), items }),
  z.object({ action: z.literal('delete-orphans'), items }),
  z.object({ action: z.literal('adopt-claimed'), items }),
  z.object({ action: z.literal('purge-missing'), items, force: z.boolean().optional() }),
])

export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'config.manage')) return errorResponse('Forbidden', 403)

  const parsed = repairSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'That request did not make sense.')
  const body = parsed.data

  try {
    switch (body.action) {
      case 'correct-sizes':
        return NextResponse.json(await correctRecordedSizes(body.items))

      case 'delete-orphans':
        if (!await hasPermission(user, 'media.delete')) return errorResponse('Forbidden', 403)
        return NextResponse.json(await deleteOrphanedObjects(body.items))

      case 'adopt-claimed':
        if (!await hasPermission(user, 'media.upload')) return errorResponse('Forbidden', 403)
        return NextResponse.json(await adoptClaimedObjects(body.items, user.id))

      case 'purge-missing':
        if (!await hasPermission(user, 'media.delete')) return errorResponse('Forbidden', 403)
        return NextResponse.json(await purgeMissingRows(body.items, body.force === true))
    }
  } catch (err: unknown) {
    return errorResponse(`Storage check failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 500)
  }
}
