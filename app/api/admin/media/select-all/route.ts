import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { errorResponse } from '@/lib/utils'
import { queryMediaLibrary, parseLibraryQuery } from '@/lib/media/library-query'
import { signAssetUrl } from '@/lib/media/asset-token'

// "Select all" for the media library. The grid pages in 25 at a time, so a
// selection made by clicking cards can only ever cover what has been scrolled
// into view - which makes "tidy up this whole folder" a scrolling exercise.
// This returns every row the current view's filters match, in one go, so the
// selection bar can act on the lot.
//
// Deliberately the same query builder as the listing route: the set selected has
// to be exactly the set on screen, folder scope, search, tags, type and the
// in-use tabs included, or the button quietly selects the wrong things.

/**
 * Ceiling on one "select all". Well past any real folder, and small enough that
 * the payload and the follow-up bulk job stay sane. Past it the response says so
 * rather than pretending the selection is complete.
 */
export const SELECT_ALL_LIMIT = 2000

export async function GET(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  const query = parseLibraryQuery(request.nextUrl.searchParams, SELECT_ALL_LIMIT, 1)
  const { items, total } = await queryMediaLibrary(query)

  // Same signing as the listing route - the selection feeds "Copy links" and the
  // ratio/resize dialogs, which show previews of items that were never on screen.
  const signed = items.map((item) => ({ ...item, url: signAssetUrl(item.url) }))

  return NextResponse.json({ items: signed, total, truncated: total > signed.length })
}
