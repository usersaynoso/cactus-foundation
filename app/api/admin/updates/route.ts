import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { getGitHubConfigStatus } from '@/lib/config/env'
import { z } from 'zod'
import {
  getCoreUpdateStatus,
  syncCoreFromUpstream,
  invalidateCoreUpdateCache,
} from '@/lib/updates/core'
import { recordDeploymentNeeded } from '@/lib/notifications/deployment'
import { recordCoreUpdate, clearAlert } from '@/lib/notifications/alerts'
import { startDeferredRedeploy } from '@/lib/deploy/redeploy'
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

  const ghConfigStatus = await getGitHubConfigStatus()
  if (ghConfigStatus === 'app_not_installed') {
    return errorResponse(
      'GitHub App is connected but not yet installed on a repository. Go to Settings → Integrations and click "Install app on repository".',
      503
    )
  }
  if (ghConfigStatus === 'not_configured') {
    return errorResponse(
      'GitHub is not configured. Connect a GitHub App or set GITHUB_API_TOKEN to apply updates.',
      503
    )
  }

  // Check deploy lock
  const lock = await prisma.deployLock.findUnique({ where: { id: 'singleton' } })
  if (lock) {
    return errorResponse('Another install or update is in progress. Please wait.', 409)
  }

  // Fetch current status to get version numbers
  const cfg = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { coreUpdateChannel: true },
  })
  const channel = (cfg?.coreUpdateChannel ?? 'public') as 'public' | 'beta'
  const status = await getCoreUpdateStatus({ channel })
  if ('localMode' in status) {
    return errorResponse('Core updates are not available in local-development mode. Update via git and redeploy on Vercel.', 503)
  }
  if (!status.configured) {
    return errorResponse('Cannot determine update status — GitHub may not be configured.', 503)
  }
  if ('error' in status) {
    return errorResponse("Couldn't determine the latest version - try again shortly.", 503)
  }
  if (!status.updateAvailable) {
    return errorResponse('Already on the latest version.', 400)
  }

  const { currentVersion, latestVersion } = status

  // Acquire deploy lock
  await prisma.deployLock.create({
    data: { id: 'singleton', lockedBy: 'cactus-core-update' },
  })

  // Captured before the sync push so startDeferredRedeploy's poll reliably picks up
  // the Vercel build that push triggers (the deploy lock guarantees no other
  // deployment exists in this window).
  const deployStartedAt = Date.now()

  let queuedModules: Awaited<ReturnType<typeof findModuleUpdates>> = []

  try {
    // Queue any modules with an available update into the SAME build the core sync is
    // about to trigger: checkout-modules.mjs pulls latest module code on every build
    // regardless of the version pinned in modules.json, so a core-only update already
    // silently refreshes module code - this just lets the DB's tracked version catch up
    // in that same deploy instead of drifting (leaving the Modules page falsely showing
    // "update available" for code that's already live). Held under the same deploy lock
    // as the core sync. Reconciled to 'active' by the existing redeploying-screen poll /
    // webhook once this deploy lands (lib/deploy/reconcile.ts), same as a solo module update.
    if (updateModules) {
      queuedModules = await findModuleUpdates()
      await Promise.all(
        queuedModules.map((m) =>
          prisma.module.update({
            where: { id: m.id },
            data: { status: 'deploying', pendingVersion: m.latestTag, updateAvailable: null, updateNotes: null },
          })
        )
      )
    }

    await syncCoreFromUpstream(currentVersion, latestVersion)
    await prisma.deployLock.deleteMany({ where: { id: 'singleton' } })

    // Bust the update cache so the panel reflects the running version after redeploy.
    invalidateCoreUpdateCache()

    // Deliberately DON'T clear the 'core-update' alert here: the core version is
    // pkg.version baked into the running build, so getCoreUpdateStatus (the GET handler)
    // re-derives it truthfully - on a successful deploy it reports up-to-date and clears
    // the alert; on a failed deploy the old build is still live, so the alert correctly
    // stays lit rather than falsely signalling the update landed.

    // The sync push already triggered a Vercel build. Arm the redeploy gate and capture
    // that build (committedSince mode skips module sync / triggerVercelRedeploy so we
    // don't double-deploy), then send the admin to the redeploying screen.
    const { triggered } = await startDeferredRedeploy({ committedSince: deployStartedAt })
    if (!triggered) {
      // No Vercel creds: there's no deploy to track, so promote any queued module
      // updates optimistically now (mirrors the solo module-update route's fallback) -
      // otherwise they'd sit in 'deploying' forever with nothing left to reconcile them.
      await Promise.all(
        queuedModules.map((m) =>
          prisma.module.update({
            where: { id: m.id },
            data: { status: 'pending_deploy', version: m.latestTag, pendingVersion: null },
          })
        )
      )
      // No Vercel creds: fall back to the deferred-notification flow.
      await recordDeploymentNeeded({ label: `Cactus core updated to v${latestVersion}` })
      return NextResponse.json({ ok: true, moduleUpdatesQueued: queuedModules.length })
    }
  } catch (err: unknown) {
    // Nothing was pushed (or the push itself failed), so roll any queued module rows
    // back to where they were - otherwise they'd be stranded in 'deploying' with no
    // deploy coming to reconcile them.
    await Promise.all(
      queuedModules.map((m) =>
        prisma.module.update({
          where: { id: m.id },
          data: {
            status: 'update_available',
            pendingVersion: null,
            updateAvailable: m.latestTag,
            updateNotes: m.releaseBody,
          },
        })
      )
    )
    await prisma.deployLock.deleteMany({ where: { id: 'singleton' } })
    return errorResponse(
      `Update failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      500
    )
  }

  return NextResponse.json({ ok: true, redeployTriggered: true, moduleUpdatesQueued: queuedModules.length })
}
