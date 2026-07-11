import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { duplicateMedia } from '@/lib/media/organise'

// POST — duplicate a batch of items into a folder (the paste half of copy/paste).
// Body: { ids, targetFolderId }. Each copy's name is auto-suffixed on clash.
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

  const created: string[] = []
  try {
    for (const id of ids as string[]) {
      const copy = await duplicateMedia(id, targetFolderId)
      created.push(copy.id)
    }
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Duplicate failed', 500)
  }

  return NextResponse.json({ ok: true, created })
}
