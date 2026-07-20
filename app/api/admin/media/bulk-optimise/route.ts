import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { optimiseMediaInPlace } from '@/lib/media/upload'

// Same reasoning as ../[id]/optimise: a 3D model is a much longer job than an
// image, and the client sends one id per request precisely so that this ceiling
// covers a single file rather than a whole selection.
export const maxDuration = 60

// Bulk companion to ../[id]/optimise — runs the same in-place optimise over a
// list of ids, one at a time (each re-encode is CPU-heavy, so no parallelism),
// and reports a per-outcome tally. A single item failing doesn't abort the rest.
export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'media.upload')) return errorResponse('Forbidden', 403)

  const body = await request.json().catch(() => null)
  const ids: unknown = body?.ids
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string')) {
    return errorResponse('ids must be a non-empty array of media IDs')
  }

  const optimised: string[] = []
  const skipped: { id: string; reason: string }[] = []
  const failed: { id: string; error: string }[] = []
  let bytesSaved = 0

  for (const id of ids) {
    try {
      const result = await optimiseMediaInPlace(id, user.id)
      if (result.optimised) {
        optimised.push(id)
        bytesSaved += result.before - result.after
      } else {
        skipped.push({ id, reason: result.reason })
      }
    } catch (err: unknown) {
      failed.push({ id, error: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  return NextResponse.json({ ok: true, optimised, skipped, failed, bytesSaved })
}
