import { NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { retryFailed } from '@/lib/media/migration'

// POST — re-open the most recent job and clear its failed list so subsequent
// batches retry just the previously-failed items.
export async function POST() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!(await hasPermission(user, 'config.manage'))) return errorResponse('Forbidden', 403)

  const job = await retryFailed()
  if (!job) return errorResponse('No migration job to retry.', 404)
  return NextResponse.json({ job })
}
