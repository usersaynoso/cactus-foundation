import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { checkUploadNamesBulk } from '@/lib/media/organise'

// Which of the names about to be uploaded are already taken in the destination
// folder, and what each could be called instead.
//
// Asked before a byte moves, so the person uploading is offered Replace / Keep
// both / Skip rather than finding out afterwards that the library silently filed
// their file under a name they didn't choose.
export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'media.upload')) return errorResponse('Forbidden', 403)

  const body = await request.json().catch(() => null)
  const rawFolderId = body?.folderId
  const folderId = typeof rawFolderId === 'string' && rawFolderId ? rawFolderId : null
  const names: string[] = Array.isArray(body?.names)
    ? body.names.filter((n: unknown): n is string => typeof n === 'string' && !!n)
    : []
  if (names.length === 0) return NextResponse.json({ clashes: [] })

  // Bulk: the whole batch is answered in a bounded number of queries. Doing this
  // name-by-name turned a 25,000-file drop into 50,000 sequential round trips,
  // which timed out before any upload began - the batch looked stuck forever.
  const clashes = await checkUploadNamesBulk(names, folderId)

  return NextResponse.json({ clashes })
}
