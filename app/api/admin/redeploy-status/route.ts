import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { invalidateSiteConfigCache, getPendingRedeployIdUncached, getAdminPathCached } from '@/lib/config/site'
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
    getPendingRedeployIdUncached(),
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
  await prisma.siteConfig.update({
    where: { id: 'singleton' },
    data: { pendingRedeployId: null, pendingRedeployAt: null },
  })
  invalidateSiteConfigCache()
  // Release any lingering lock.
  await prisma.deployLock.deleteMany({})
  // Reconcile any modules still 'deploying' against the real deployment outcome rather
  // than assuming success - dismissing a failed deploy must not mark it active.
  const deploying = await prisma.module.findMany({ where: { status: 'deploying' }, select: { id: true } })
  if (deploying.length > 0) {
    const deployStatus = await getLatestDeploymentStatus()
    if (deployStatus === 'READY') {
      await markModulesDeploySucceeded()
    } else if (deployStatus === 'ERROR') {
      await markModulesDeployFailed('Vercel deployment failed')
    }
    // BUILDING / UNKNOWN: leave as 'deploying'; the next Modules-page check reconciles.
  }
  return NextResponse.json({ ok: true })
}
