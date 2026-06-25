import { NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { getActiveMediaProvider } from '@/lib/config/env'
import { startJob } from '@/lib/media/migration'

// POST — start a migration job targeting the currently active provider.
export async function POST() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!(await hasPermission(user, 'config.manage'))) return errorResponse('Forbidden', 403)

  const provider = await getActiveMediaProvider()
  if (!provider) return errorResponse('No active media provider is selected.', 400)

  const job = await startJob(provider)
  if (!job) return errorResponse('A migration job is already running.', 409)

  return NextResponse.json({ job }, { status: 201 })
}
