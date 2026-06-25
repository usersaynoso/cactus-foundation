import { NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { cancelJob } from '@/lib/media/migration'

// POST — cancel the active migration job. Already-migrated items stay migrated.
export async function POST() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!(await hasPermission(user, 'config.manage'))) return errorResponse('Forbidden', 403)

  const cancelled = await cancelJob()
  if (!cancelled) return errorResponse('No running migration job to cancel.', 404)
  return NextResponse.json({ ok: true })
}
