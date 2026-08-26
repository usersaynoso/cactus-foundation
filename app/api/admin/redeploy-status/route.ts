import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { invalidateSiteConfigCache, getPendingRedeployIdCached, getAdminPathCached } from '@/lib/config/site'
import { errorResponse } from '@/lib/utils'
import { getLatestDeploymentStatus } from '@/lib/modules/github'
import { markModulesDeploySucceeded, markModulesDeployFailed } from '@/lib/deploy/reconcile'

// No permission gate beyond session, intentionally: the admin shell's deploy
// status surfaces (the notification bell's live section and the notifications
// page, both fed by lib/deploy-status-client.ts) poll this route from *every*
// authenticated admin session, any role. Gating this on config.manage would
// hide live deploy state from non-manage roles - worse than the info it would
// hide (a deployment id and the already-reachable admin path).
export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  const [deploymentId, adminPath] = await Promise.all([
    getPendingRedeployIdCached(),
    getAdminPathCached(),
  ])
  return NextResponse.json({
    deploymentId,
    adminPath: adminPath ?? '',
  })
}

export async function DELETE() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'config.manage')) return errorResponse('Forbidden', 403)
  // Read the tracked deployment id BEFORE clearing it. Reading it back afterwards
  // always returned null, so getLatestDeploymentStatus fell through to "whatever
  // landed most recently on this project" - the exact misattribution its own comment
  // warns against. Dismissing the status bar then reconciled these modules against a
  // stranger's build: someone else's green push promoted a pendingVersion whose code
  // was never deployed, and someone else's red one rolled a healthy update back.
  const tracked = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { pendingRedeployId: true },
  })
  await prisma.siteConfig.update({
    where: { id: 'singleton' },
    data: { pendingRedeployId: null, pendingRedeployAt: null },
  })
  invalidateSiteConfigCache()
  // Release any lingering lock.
  await prisma.deployLock.deleteMany({})
  // Reconcile any modules still 'deploying' against the real deployment outcome rather
  // than assuming success - dismissing a failed deploy must not mark it active.
  const deploying = await prisma.module.findMany({
    where: { status: 'deploying' },
    select: { id: true, deployId: true },
  })
  if (deploying.length > 0) {
    // Prefer the deployment the modules themselves are riding on. The site marker
    // has just been cleared above and self-expires anyway, so it is the weaker
    // record of the two - see the note in the modules check-status route.
    const moduleDeployId = deploying.find((m) => m.deployId && m.deployId !== 'pending')?.deployId
    const trackedId = moduleDeployId ?? tracked?.pendingRedeployId
    const deployStatus = await getLatestDeploymentStatus(trackedId)
    if (deployStatus === 'READY') {
      await markModulesDeploySucceeded(trackedId)
    } else if (deployStatus === 'ERROR') {
      await markModulesDeployFailed('Vercel deployment failed', trackedId)
    }
    // BUILDING / UNKNOWN: leave as 'deploying'; the next Modules-page check reconciles.
  }
  return NextResponse.json({ ok: true })
}
