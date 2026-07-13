import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { errorResponse } from '@/lib/utils'
import { getReleaseNotesPage } from '@/lib/updates/core'

export const maxDuration = 30

// Paginated release history for the admin About dialog's "Release notes" panel
// (infinite scroll). Any authenticated admin may read it - the upstream releases
// are public information, so no config.manage gate.
export async function GET(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  const raw = request.nextUrl.searchParams.get('page')
  const parsed = raw ? parseInt(raw, 10) : 1
  const page = Number.isFinite(parsed) && parsed > 0 ? parsed : 1

  try {
    const result = await getReleaseNotesPage({ page })
    return NextResponse.json(result)
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to load release notes', 502)
  }
}
