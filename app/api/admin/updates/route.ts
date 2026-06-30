import { NextResponse, after } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { getGitHubConfigStatus } from '@/lib/config/env'
import { invalidateSiteConfigCache } from '@/lib/config/site'
import {
  getCoreUpdateStatus,
  syncCoreFromUpstream,
  invalidateCoreUpdateCache,
} from '@/lib/updates/core'

export const maxDuration = 60

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'config.manage')) return errorResponse('Forbidden', 403)

  const status = await getCoreUpdateStatus()
  return NextResponse.json(status)
}

export async function POST() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'config.manage')) return errorResponse('Forbidden', 403)

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
  const status = await getCoreUpdateStatus()
  if (!status.configured) {
    return errorResponse('Cannot determine update status — GitHub may not be configured.', 503)
  }
  if (!status.updateAvailable) {
    return errorResponse('Already on the latest version.', 400)
  }

  const { currentVersion, latestVersion } = status

  // Acquire deploy lock
  await prisma.deployLock.create({
    data: { id: 'singleton', lockedBy: 'cactus-core-update' },
  })

  const deployStartedAt = Date.now()

  try {
    await syncCoreFromUpstream(currentVersion, latestVersion)

    // Bust the update cache so the panel reflects the new version after redeploy
    invalidateCoreUpdateCache()

    await prisma.siteConfig.update({
      where: { id: 'singleton' },
      data: { pendingRedeployId: 'pending', pendingRedeployAt: new Date() },
    })
    invalidateSiteConfigCache()

    after(async () => {
      const token = process.env.VERCEL_API_TOKEN
      const projectId = process.env.VERCEL_PROJECT_ID
      if (!token || !projectId) return
      let uid: string | undefined
      for (let i = 0; i < 8; i++) {
        await new Promise(r => setTimeout(r, 5_000))
        try {
          const res = await fetch(
            `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=5`,
            { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8_000) }
          )
          if (res.ok) {
            const data = (await res.json()) as { deployments?: Array<{ uid: string; created: number }> }
            uid = data.deployments?.find(d => d.created > deployStartedAt)?.uid
            if (uid) break
          }
        } catch { /* ignore */ }
      }
      if (uid) {
        await prisma.siteConfig.updateMany({
          where: { id: 'singleton', pendingRedeployId: 'pending' },
          data: { pendingRedeployId: uid },
        })
        invalidateSiteConfigCache()
      }
    })
  } catch (err: unknown) {
    await prisma.deployLock.deleteMany({ where: { id: 'singleton' } })
    return errorResponse(
      `Update failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      500
    )
  }

  return NextResponse.json({ ok: true, redeployTriggered: true })
}
