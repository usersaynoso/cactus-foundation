import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { changeMediaAspectRatio } from '@/lib/media/upload'
import { parseAspectRequest } from '@/lib/media/aspect-request'

// Bulk companion to ../[id]/aspect — runs the same pad-to-ratio over a list of
// ids, one at a time (each re-encode is CPU-heavy, so no parallelism), and
// reports a per-outcome tally. A single item failing doesn't abort the rest, so
// one awkward image can't cost the other forty their reshape.
export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'media.upload')) return errorResponse('Forbidden', 403)

  const body = await request.json().catch(() => null)
  const ids: unknown = (body as Record<string, unknown>)?.ids
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string')) {
    return errorResponse('ids must be a non-empty array of media IDs')
  }

  const parsed = parseAspectRequest(body)
  if (!parsed.ok) return errorResponse(parsed.error)

  const changed: string[] = []
  const skipped: { id: string; reason: string }[] = []
  const failed: { id: string; error: string }[] = []

  for (const id of ids) {
    try {
      const result = await changeMediaAspectRatio(id, parsed.value, user.id)
      if (result.changed) changed.push(id)
      else skipped.push({ id, reason: result.reason })
    } catch (err: unknown) {
      failed.push({ id, error: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  return NextResponse.json({ ok: true, changed, skipped, failed })
}
