import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { countUnmeasuredImages, measureUnmeasuredBatch } from '@/lib/media/dimensions'

// Measuring is a range request to storage and a header parse - no decode, no
// re-encode - so a batch is over in a second or two. The ceiling is here for the
// pathological case (a provider ignoring Range on a folder of 40 MB scans)
// rather than for the ordinary one.
export const maxDuration = 60

/**
 * How many images to measure per request, and the cap on what a caller may ask
 * for. Batched rather than one-per-request like the bulk image jobs, because
 * each item here costs a fraction of what a re-encode does and a library of
 * 35,000 pictures should not need 35,000 round trips to the site to get through.
 */
const DEFAULT_BATCH = 40
const MAX_BATCH = 200

/** How many raster images are still unmeasured - what the page's prompt counts. */
export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  return NextResponse.json({ remaining: await countUnmeasuredImages() })
}

/**
 * Measure the next batch of unmeasured images and report what is left.
 *
 * The caller doesn't choose which rows: the batch is whatever is still
 * unmeasured, newest first, so calling this in a loop until `remaining` reaches
 * zero works through the whole library without the client having to hold a list
 * of 35,000 ids - and picking up where it left off if the tab is closed halfway.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'media.upload')) return errorResponse('Forbidden', 403)

  const body = await request.json().catch(() => null)
  const asked = typeof body?.limit === 'number' ? Math.floor(body.limit) : DEFAULT_BATCH
  const limit = Math.min(MAX_BATCH, Math.max(1, Number.isFinite(asked) ? asked : DEFAULT_BATCH))

  const result = await measureUnmeasuredBatch(limit)
  return NextResponse.json({ ok: true, ...result })
}
