import { NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { errorResponse } from '@/lib/utils'
import { computeUnusedByFolder } from '@/lib/media/library-stats'

// One pass over every media row plus the usage index - the same work the Unused
// stat tile costs, so it gets the same ceiling as the other whole-library scans
// rather than the default.
export const maxDuration = 60

/**
 * Which folders currently hold files nothing on the site references, and how
 * much is in each. Feeds the folder filter on the media page's Unused view; the
 * page turns the ids into readable paths itself, from the folder tree it already
 * has, so this stays a tally rather than a second folder listing that could
 * disagree with the first.
 */
export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  return NextResponse.json({ folders: await computeUnusedByFolder() })
}
