import { NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { isAdmin } from '@/lib/permissions/check'
import { pageStoreStats } from '@/lib/cache/page-store/signal'
import { errorResponse } from '@/lib/utils'

// What the page store is holding and doing, for Settings > General > Speed. Null when
// it has not started in this process: switched off, or nothing has asked for a page yet.
export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!isAdmin(user)) return errorResponse('Forbidden', 403)
  return NextResponse.json({ stats: pageStoreStats() })
}
