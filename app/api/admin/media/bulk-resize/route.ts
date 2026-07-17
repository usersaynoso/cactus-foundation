import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { resizeMediaImage } from '@/lib/media/upload'
import { parseResizeRequest } from '@/lib/media/resize-request'

// Bulk companion to ../[id]/resize — runs the same fit-inside-a-box over a list
// of ids, one at a time (each re-encode is CPU-heavy, so no parallelism), and
// reports a per-outcome tally. A single item failing doesn't abort the rest, so
// one awkward image can't cost the other forty their resize.
export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'media.upload')) return errorResponse('Forbidden', 403)

  const body = await request.json().catch(() => null)
  const ids: unknown = (body as Record<string, unknown>)?.ids
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string')) {
    return errorResponse('ids must be a non-empty array of media IDs')
  }

  const parsed = parseResizeRequest(body)
  if (!parsed.ok) return errorResponse(parsed.error)

  const changed: string[] = []
  const skipped: { id: string; reason: string }[] = []
  const failed: { id: string; error: string }[] = []
  let bytesSaved = 0

  const { width, height, mode } = parsed.value
  for (const id of ids) {
    try {
      // No newName: a single shared name across a bulk run would just collide, so
      // the server suffixes each file with its new size instead.
      const result = await resizeMediaImage(id, { box: { width, height }, mode }, user.id)
      if (result.changed) {
        changed.push(id)
        bytesSaved += Math.max(0, result.before - result.after)
      } else {
        skipped.push({ id, reason: result.reason })
      }
    } catch (err: unknown) {
      failed.push({ id, error: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  return NextResponse.json({ ok: true, changed, skipped, failed, bytesSaved })
}
