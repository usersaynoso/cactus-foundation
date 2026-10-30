import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { z } from 'zod'
import { getCoreUpdateStatus } from '@/lib/updates/core'
import { applyCoreUpdate } from '@/lib/updates/apply-core'
import { recordCoreUpdate, clearAlert } from '@/lib/notifications/alerts'
import { findModuleUpdates } from '@/lib/modules/updates'

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'config.manage')) return errorResponse('Forbidden', 403)

  const bust = request.nextUrl.searchParams.get('bust') === 'true'

  const cfg = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { coreUpdateChannel: true },
  })
  const channel = (cfg?.coreUpdateChannel ?? 'public') as 'public' | 'beta'

  const status = await getCoreUpdateStatus({ bust, channel })
  const coreUpdateAvailable = !('localMode' in status) && status.configured && 'updateAvailable' in status && status.updateAvailable

  // Raise (or clear) the on-demand "update available" notification so the bell
  // persists the reminder across the admin. Never let this break the endpoint.
  // (Local mode never has an update available, so this clears any stale alert.)
  try {
    if (coreUpdateAvailable && !('localMode' in status) && status.configured && 'updateAvailable' in status) {
      await recordCoreUpdate(status.latestVersion)
    } else {
      await clearAlert('core-update')
    }
  } catch (err) {
    console.error('[updates] Failed to sync core-update notification:', err)
  }

  // Only worth the extra GitHub calls when the confirm dialog (which offers to
  // bundle module updates in) is actually going to be shown.
  let modulesWithUpdates: Awaited<ReturnType<typeof findModuleUpdates>> = []
  if (coreUpdateAvailable) {
    try {
      modulesWithUpdates = await findModuleUpdates()
    } catch (err) {
      console.error('[updates] Failed to check module updates:', err)
    }
  }

  return NextResponse.json({ status, coreUpdateChannel: channel, modulesWithUpdates })
}

const PostBody = z.object({ updateModules: z.boolean().optional() })

export async function POST(request: NextRequest) {
  // The 60s ceiling starts here, not where the deadline is computed below. By that
  // point the handler has already spent several round trips on GitHub, Vercel and
  // the deploy checks, so a budget measured from there can outlive the function it
  // is supposed to finish inside - which is the hard kill it exists to avoid.
  const routeStartedAt = Date.now()

  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'config.manage')) return errorResponse('Forbidden', 403)

  // Body is optional for backwards compatibility with any existing callers that POST
  // with no payload - those just skip the module bundling.
  let updateModules = false
  try {
    const raw = await request.text()
    if (raw) {
      const parsed = PostBody.safeParse(JSON.parse(raw))
      if (parsed.success) updateModules = parsed.data.updateModules ?? false
    }
  } catch { /* malformed body: fall back to core-only update */ }

  return applyCoreUpdate({ updateModules, routeStartedAt })
}
