import { NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { countMediaUrlsOffServingMode, rebaseMediaUrlsToServingMode } from '@/lib/media/upload'
import { directResizeMode, mediaServingMode } from '@/lib/media/serving-mode'
import { workerUrl } from '@/lib/media/worker-url'

// Settings → Media, "How pictures are served" (lib/media/serving-mode.ts).
//
// GET  - the mode the RUNNING deployment is in, and how many stored urls are
//        still in the other mode's shape.
// POST - move those urls across, and every page, layout and module table that
//        names them (rebaseMediaUrlsToServingMode). Only urls change, rebuilt
//        from the immutable key: nothing in the bucket is touched, and switching
//        back puts every url back exactly as it was. Works for as long as the
//        time limit allows and reports what is left; the page calls again until
//        nothing is.
//
// The mode itself is an environment variable saved by the page's ordinary Save
// button, and only reaches the code after a redeploy. That is why moving the
// urls is a separate step taken here rather than at the moment of saving: until
// the redeploy, the live site cannot serve the new shape.

export const maxDuration = 60

// Stop taking new rows well inside maxDuration, leaving room for the row in hand
// (a dozen module rewriters) and the closing count.
const WORK_BUDGET_MS = 40_000

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!(await hasPermission(user, 'config.manage'))) return errorResponse('Forbidden', 403)

  const { pending } = await countMediaUrlsOffServingMode()
  return NextResponse.json({
    mode: mediaServingMode(),
    resize: directResizeMode(),
    pending,
    workerConfigured: !!workerUrl(),
  })
}

export async function POST() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!(await hasPermission(user, 'config.manage'))) return errorResponse('Forbidden', 403)

  try {
    const { mode, moved, remaining } = await rebaseMediaUrlsToServingMode({ deadline: Date.now() + WORK_BUDGET_MS })
    return NextResponse.json({ ok: true, mode, moved, remaining })
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Could not move the pictures across.', 409)
  }
}
