import { NextRequest, NextResponse, after } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { triggerVercelRedeploy } from '@/lib/vercel/deploy'
import { syncModulesJson } from '@/lib/modules/github'
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
    // Persist a resolved deployment id (or clear the sentinel if nothing started).
    const persistDeploymentId = async (uid: string | undefined) => {
      try {
        await prisma.siteConfig.updateMany({
          where: { id: 'singleton', pendingRedeployId: 'pending' },
          data: uid
            ? { pendingRedeployId: uid }
            : { pendingRedeployId: null, pendingRedeployAt: null },
        })
        invalidateSiteConfigCache()
      } catch (err) {
        console.error('[notifications/redeploy] Failed to persist pendingRedeployId:', err)
      }
    }

    // Poll Vercel for the deployment created after we started (used when we don't
    // get an id back directly — e.g. a git-push-triggered build).
    const pollForDeploymentId = async (): Promise<string | undefined> => {
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 5_000))
        try {
          const res = await fetch(
            `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=5`,
            { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8_000) }
          )
          if (res.ok) {
            const data = (await res.json()) as { deployments?: Array<{ uid: string; created: number }> }
            const uid = data.deployments?.find((d) => d.created > deployStartedAt)?.uid
            if (uid) return uid
          }
        } catch { /* ignore */ }
      }
      return undefined
    }

    // Deferred module registry sync. The desired state is the full set of Module rows
    // (any status — a row existing means its code should ship; uninstall already deleted
    // the row). If creds are missing or this throws, fall through to the env-var redeploy
    // path so settings-only redeploys still work.
    let committed = false
    try {
      const modules = await prisma.module.findMany()
      const synced = await syncModulesJson(
        modules.map((m) => ({ name: m.name, repoUrl: m.repoUrl, version: m.version }))
      )
      committed = synced.committed
    } catch (err) {
      console.error('[notifications/redeploy] Module registry sync failed, falling back to redeploy:', err)
    }

    if (committed) {
      // The git push already triggered a Vercel build — do NOT trigger another, or we
      // double-deploy. Just capture the build the push created.
      await persistDeploymentId(await pollForDeploymentId())
      return
    }

    // No module changes to commit: rebuild current HEAD to pick up env-var changes.
    const result = await triggerVercelRedeploy(token, projectId)
    if (result.triggered && result.deploymentId) {
      await persistDeploymentId(result.deploymentId)
    } else {
      await persistDeploymentId(await pollForDeploymentId())
    }
  })

  return NextResponse.json({ ok: true, redeployTriggered: true })
}
