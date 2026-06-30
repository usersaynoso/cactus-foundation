import { NextRequest, NextResponse, after } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { triggerVercelRedeploy } from '@/lib/vercel/deploy'
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
  const deployStartedAt = Date.now()

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
    prisma.siteConfig.update({
      where: { id: 'singleton' },
      data: { pendingRedeployId: 'pending', pendingRedeployAt: now },
    }),
  ])
  invalidateSiteConfigCache()

  after(async () => {
    const result = await triggerVercelRedeploy(token, projectId)
    if (result.triggered && result.deploymentId) {
      try {
        await prisma.siteConfig.updateMany({
          where: { id: 'singleton', pendingRedeployId: 'pending' },
          data: { pendingRedeployId: result.deploymentId },
        })
        invalidateSiteConfigCache()
      } catch (err) {
        console.error('[notifications/redeploy] Failed to persist pendingRedeployId:', err)
      }
    } else {
      // Poll for the real deployment ID since triggerVercelRedeploy didn't return one
      let uid: string | undefined
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 5_000))
        try {
          const res = await fetch(
            `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=5`,
            { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8_000) }
          )
          if (res.ok) {
            const data = (await res.json()) as { deployments?: Array<{ uid: string; created: number }> }
            uid = data.deployments?.find((d) => d.created > deployStartedAt)?.uid
            if (uid) break
          }
        } catch { /* ignore */ }
      }
      if (uid) {
        try {
          await prisma.siteConfig.updateMany({
            where: { id: 'singleton', pendingRedeployId: 'pending' },
            data: { pendingRedeployId: uid },
          })
          invalidateSiteConfigCache()
        } catch (err) {
          console.error('[notifications/redeploy] Failed to persist polled deploymentId:', err)
        }
      } else {
        // Redeploy never started - clear sentinel so admin isn't stranded
        try {
          await prisma.siteConfig.updateMany({
            where: { id: 'singleton', pendingRedeployId: 'pending' },
            data: { pendingRedeployId: null, pendingRedeployAt: null },
          })
          invalidateSiteConfigCache()
        } catch (err) {
          console.error('[notifications/redeploy] Failed to clear pendingRedeployId sentinel:', err)
        }
      }
    }
  })

  return NextResponse.json({ ok: true, redeployTriggered: true })
}
