import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { startDeferredRedeploy } from '@/lib/deploy/redeploy'
import { invalidateSiteConfigCache } from '@/lib/config/site'

export const maxDuration = 60

type Params = { params: Promise<{ id: string }> }

export async function POST(_request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'config.manage')) return errorResponse('Forbidden', 403)

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

  const now = new Date()

  // Mark notification as actioned and flip pending_deploy modules to deploying
  await prisma.$transaction([
    prisma.notification.update({
      where: { id },
      data: { readAt: now, deployInitiatedAt: now },
    }),
    prisma.module.updateMany({
      where: { status: 'pending_deploy' },
      data: { status: 'deploying' },
    }),
  ])
  invalidateSiteConfigCache()

  // Opens the redeploy gate and ships the registry (commit modules.json + capture
  // the build, or env-var redeploy fallback) in an after() callback.
  await startDeferredRedeploy()

  return NextResponse.json({ ok: true, redeployTriggered: true })
}
