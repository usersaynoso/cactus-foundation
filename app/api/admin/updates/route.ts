import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { getGitHubConfigStatus } from '@/lib/config/env'
import {
  getCoreUpdateStatus,
  syncCoreFromUpstream,
  invalidateCoreUpdateCache,
} from '@/lib/updates/core'
import { recordDeploymentNeeded } from '@/lib/notifications/deployment'

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

  try {
    await syncCoreFromUpstream(currentVersion, latestVersion)
    await prisma.deployLock.deleteMany({ where: { id: 'singleton' } })

    // Bust the update cache so the panel reflects the new version after redeploy
    invalidateCoreUpdateCache()

    await recordDeploymentNeeded({ label: `Cactus core updated to v${latestVersion}` })
  } catch (err: unknown) {
    await prisma.deployLock.deleteMany({ where: { id: 'singleton' } })
    return errorResponse(
      `Update failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      500
    )
  }

  return NextResponse.json({ ok: true })
}
