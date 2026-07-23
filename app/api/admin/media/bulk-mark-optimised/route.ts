import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { markMediaOptimised } from '@/lib/media/upload'

// Say a file is already optimised (or take that back) without re-encoding it.
//
// Unlike its neighbours in this folder, this route moves no bytes: it is one
// SELECT and one UPDATE, so it takes the whole selection in a single request
// rather than being driven an id at a time through runBulkImageJob. There is no
// per-image work here for a serverless time limit to bite into, and marking four
// hundred files should cost one round trip rather than four hundred.
//
// Same permission as the optimiser itself, because this decides what the library
// will offer to do to a file, which is the optimiser's business.
export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'media.upload')) return errorResponse('Forbidden', 403)

  const body = await request.json().catch(() => null)
  const ids: unknown = (body as Record<string, unknown>)?.ids
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string')) {
    return errorResponse('ids must be a non-empty array of media IDs')
  }

  const optimised: unknown = (body as Record<string, unknown>)?.optimised
  if (optimised !== undefined && typeof optimised !== 'boolean') {
    return errorResponse('optimised must be true or false')
  }

  const result = await markMediaOptimised(ids, optimised ?? true)
  return NextResponse.json({ ok: true, ...result })
}
