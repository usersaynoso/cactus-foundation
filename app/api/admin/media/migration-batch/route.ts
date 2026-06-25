import { NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { processBatch } from '@/lib/media/migration'

// POST — process one batch of the active migration job. Called repeatedly by the
// client while the migration screen is open.
export async function POST() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!(await hasPermission(user, 'config.manage'))) return errorResponse('Forbidden', 403)

  try {
    const result = await processBatch()
    return NextResponse.json(result)
  } catch (err: unknown) {
    return errorResponse(`Migration batch failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 500)
  }
}
