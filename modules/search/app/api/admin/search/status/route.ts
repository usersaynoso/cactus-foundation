import { NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { getIndexStatus } from '@/modules/search/lib/indexer'
import { syncIndexAlert } from '@/modules/search/lib/alerts'

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'search.view')) return errorResponse('Forbidden', 403)

  const status = await getIndexStatus()
  await syncIndexAlert()
  return NextResponse.json(status)
}
