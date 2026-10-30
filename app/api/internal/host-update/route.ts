import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { errorResponse } from '@/lib/utils'
import { safeCompare } from '@/lib/auth/session-core'
import { getCoreUpdateStatus } from '@/lib/updates/core'
import { applyCoreUpdate } from '@/lib/updates/apply-core'
import { findModuleUpdates } from '@/lib/modules/updates'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { applyModuleUpdateAll } from '@/lib/modules/update-all'
import type { HostUpdateCheck, HostUpdateResponse } from '@/cactus-host/protocol'

// GET /api/internal/host-update: the same question without the answer being acted on -
// is there a newer Cactus, and which modules (custom ones included: every installed
// module is checked against its own repo) have a newer release. Nothing is written.
//
// POST /api/internal/host-update: the server this site runs on asks it to bring Cactus
// and every module up to date in one build, exactly as the admin would from Settings →
// Updates with "also update modules" ticked, or from Modules → Update all when only
// modules have anything new. The build that follows switches over by itself once the
// new version passes its health check, as every build on the server does.
//
// Only cactus-host can call it: it is the only other holder of this site's
// CACTUS_HOST_TOKEN, which it wrote into the site's env and reads back to call here.
// On any other host the route does not exist.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** null when the caller is this site's cactus-host, otherwise the response to send. */
function refuseUnlessHost(request: NextRequest): Response | null {
  const token = process.env.CACTUS_HOST_TOKEN
  if (process.env.CACTUS_HOSTING_PROVIDER !== 'server' || !token) return errorResponse('Not found', 404)
  const given = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!given || !safeCompare(given, token)) return errorResponse('Not authenticated', 401)
  return null
}

export async function GET(request: NextRequest) {
  const refused = refuseUnlessHost(request)
  if (refused) return refused

  const cfg = await prisma.siteConfig.findUnique({ where: { id: 'singleton' }, select: { coreUpdateChannel: true } })
  const channel = (cfg?.coreUpdateChannel ?? 'public') as 'public' | 'beta'
  const failed: Array<{ name: string; error: string }> = []
  const [status, found, installed] = await Promise.all([
    getCoreUpdateStatus({ bust: true, channel }),
    findModuleUpdates(failed),
    prisma.module.count({ where: INSTALLED_MODULE_WHERE }),
  ])
  if ('localMode' in status || !status.configured) {
    return errorResponse('This site cannot check for updates: GitHub is not connected', 503)
  }
  if ('error' in status) return errorResponse("Couldn't find out the latest version - try again shortly.", 503)

  return NextResponse.json({
    ok: true,
    core: { current: status.currentVersion, latest: status.latestVersion, updateAvailable: status.updateAvailable },
    modules: found.map((m) => ({ name: m.name, current: m.currentVersion, latest: m.latestTag.replace(/^v/, '') })),
    modulesChecked: installed,
    failed,
  } satisfies HostUpdateCheck)
}

export async function POST(request: NextRequest) {
  const routeStartedAt = Date.now()
  const refused = refuseUnlessHost(request)
  if (refused) return refused

  const cfg = await prisma.siteConfig.findUnique({ where: { id: 'singleton' }, select: { coreUpdateChannel: true } })
  const channel = (cfg?.coreUpdateChannel ?? 'public') as 'public' | 'beta'
  const status = await getCoreUpdateStatus({ bust: true, channel })
  if ('localMode' in status || !status.configured) {
    return errorResponse('This site cannot check for updates: GitHub is not connected', 503)
  }
  if ('error' in status) return errorResponse("Couldn't find out the latest version - try again shortly.", 503)

  if (status.updateAvailable) {
    const res = await applyCoreUpdate({ updateModules: true, routeStartedAt })
    return withSummary(res, { core: { from: status.currentVersion, to: status.latestVersion } })
  }

  // Core is current. The Modules page only updates rows already flagged as having an
  // update, so flag whatever is new first, as its per-module check would.
  const found = await findModuleUpdates()
  if (found.length === 0) {
    return NextResponse.json({ ok: true, upToDate: true, core: null, updated: 0, failed: [], redeployTriggered: false } satisfies HostUpdateResponse)
  }
  await Promise.all(
    found.map((m) =>
      prisma.module.update({
        where: { id: m.id },
        data: { status: 'update_available', updateAvailable: m.latestTag, updateNotes: m.releaseBody, lastCheckedAt: new Date() },
      })
    )
  )
  return withSummary(await applyModuleUpdateAll(), { core: null })
}

/** The shared update code answers in the shape its admin screen wants; this one answers the server's. */
async function withSummary(res: Response, extra: Pick<HostUpdateResponse, 'core'>): Promise<Response> {
  if (!res.ok) return res
  const body = (await res.json()) as {
    updated?: number
    moduleUpdatesQueued?: number
    failed?: string[]
    moduleUpdatesSkipped?: string[]
    redeployTriggered?: boolean
    manualDeployRequired?: boolean
  }
  return NextResponse.json({
    ok: true,
    upToDate: false,
    core: extra.core,
    updated: body.updated ?? body.moduleUpdatesQueued ?? 0,
    failed: body.failed ?? body.moduleUpdatesSkipped ?? [],
    redeployTriggered: body.redeployTriggered === true,
  } satisfies HostUpdateResponse)
}
