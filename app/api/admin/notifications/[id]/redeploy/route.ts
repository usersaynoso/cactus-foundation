import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { startDeferredRedeploy } from '@/lib/deploy/redeploy'
import { getDeployInFlight, deployInFlightMessage } from '@/lib/deploy/in-flight'
import { invalidateSiteConfigCache } from '@/lib/config/site'
import { isLocalMode } from '@/lib/config/env'

export const maxDuration = 60

type Params = { params: Promise<{ id: string }> }

export async function POST(_request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'config.manage')) return errorResponse('Forbidden', 403)

  if (isLocalMode()) {
    return errorResponse('Redeploys are not available in local-development mode. Deploy your changes via git + Vercel.', 503)
  }

  const token = process.env.VERCEL_API_TOKEN
  const projectId = process.env.VERCEL_PROJECT_ID
  if (!token || !projectId) {
    return errorResponse('VERCEL_API_TOKEN and VERCEL_PROJECT_ID are required', 503)
  }

  const { id } = await params
  const notification = await prisma.notification.findUnique({ where: { id } })
  if (!notification) return errorResponse('Notification not found', 404)
  if (notification.deployInitiatedAt) {
    return errorResponse('Deployment already initiated for this notification', 409)
  }

  // deployInitiatedAt only stops THIS notification firing twice; it says nothing
  // about a build somebody else's action started. Firing into one is worse here
  // than anywhere else, because the transaction below first sweeps every
  // pending_deploy module into 'deploying' - so the build already running lands,
  // and markModulesDeploySucceeded() promotes the lot, including modules whose
  // code is only in the commit this request is about to push.
  const inFlight = await getDeployInFlight()
  if (inFlight) return errorResponse(deployInFlightMessage(inFlight), 409)

  const now = new Date()

  // Mark notification as actioned and flip pending_deploy modules to deploying
  await prisma.$transaction([
    prisma.notification.update({
      where: { id },
      data: { readAt: now, deployInitiatedAt: now },
    }),
    prisma.module.updateMany({
      where: { status: 'pending_deploy' },
      data: { status: 'deploying', deployId: 'pending' },
    }),
  ])
  invalidateSiteConfigCache()

  // Opens the redeploy gate and ships the registry (commit modules.json + capture
  // the build, or env-var redeploy fallback) in an after() callback.
  await startDeferredRedeploy()

  return NextResponse.json({ ok: true, redeployTriggered: true })
}
