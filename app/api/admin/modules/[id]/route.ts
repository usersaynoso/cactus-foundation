import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { getLatestRelease, getLatestDeploymentStatus } from '@/lib/modules/github'
import { getGitHubConfigStatus, isLocalMode } from '@/lib/config/env'
import { recordDeploymentNeeded } from '@/lib/notifications/deployment'
import { recordModuleUpdate, clearAlert } from '@/lib/notifications/alerts'
import { startDeferredRedeploy } from '@/lib/deploy/redeploy'
import { markModulesDeploySucceeded, markModulesDeployFailed } from '@/lib/deploy/reconcile'

export const maxDuration = 60

const Patch = z.object({
  action: z.enum(['update', 'enable', 'disable', 'check-status']).optional(),
  updateChannel: z.enum(['public', 'beta']).optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'modules.manage')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const mod = await prisma.module.findUnique({ where: { id } })
  if (!mod) return errorResponse('Module not found', 404)

  const parsed = Patch.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input')

  const { action, updateChannel: newUpdateChannel } = parsed.data

  if (newUpdateChannel) {
    await prisma.module.update({ where: { id }, data: { updateChannel: newUpdateChannel } })
    return NextResponse.json({ ok: true })
  }

  if (action === 'disable') {
    await prisma.module.update({ where: { id }, data: { status: 'inactive' } })
    return NextResponse.json({ ok: true })
  }

  if (action === 'enable') {
    await prisma.module.update({ where: { id }, data: { status: 'active' } })
    return NextResponse.json({ ok: true })
  }

  if (action === 'check-status') {
    // Lazy status check: used when webhooks aren't configured (Hobby plan)
    if (mod.status !== 'deploying') {
      return NextResponse.json({ status: mod.status })
    }
    const deployStatus = await getLatestDeploymentStatus()
    if (deployStatus === 'READY') {
      await markModulesDeploySucceeded()
      await prisma.deployLock.deleteMany({ where: { id: 'singleton' } })
      return NextResponse.json({ status: 'active' })
    } else if (deployStatus === 'ERROR') {
      await markModulesDeployFailed('Vercel deployment failed')
      await prisma.deployLock.deleteMany({ where: { id: 'singleton' } })
      const refreshed = await prisma.module.findUnique({ where: { id }, select: { status: true } })
      return NextResponse.json({ status: refreshed?.status ?? 'failed' })
    }
    return NextResponse.json({ status: 'deploying' })
  }

  if (action === 'update') {
    if (isLocalMode()) {
      return errorResponse('Module updates are not available in local-development mode. Update the module repo and redeploy on Vercel.', 503)
    }
    const ghConfigStatus = await getGitHubConfigStatus()
    if (ghConfigStatus === 'app_not_installed') {
      return errorResponse(
        'GitHub App is connected but not yet installed on a repository. Go to Settings → Integrations and click "Install app on repository".',
        503
      )
    }
    if (ghConfigStatus === 'not_configured') {
      return errorResponse(
        'GitHub is not configured. Connect a GitHub App or set GITHUB_API_TOKEN to update modules.',
        503
      )
    }

    const lock = await prisma.deployLock.findUnique({ where: { id: 'singleton' } })
    if (lock) return errorResponse('Another install or update is in progress', 409)

    const release = await getLatestRelease(mod.repoUrl, mod.updateChannel as 'public' | 'beta')
    if (!release) return errorResponse('No tagged releases found', 404)

    await prisma.deployLock.create({
      data: { id: 'singleton', lockedBy: `module:${mod.name}` },
    })

    try {
      // Commit modules.json and redeploy immediately: the git push auto-deploys and the
      // admin is sent to the redeploying screen. The module ships as 'deploying' with the
      // new tag held in pendingVersion - the confirmed `version` only moves once the deploy
      // succeeds (markModulesDeploySucceeded), so a failed deploy doesn't masquerade as done.
      await prisma.module.update({
        where: { id },
        data: { status: 'deploying', pendingVersion: release.tag },
      })
      await prisma.deployLock.deleteMany({ where: { id: 'singleton' } })

      const { triggered } = await startDeferredRedeploy()
      if (!triggered) {
        // No Vercel creds: there's no deploy to track, so apply the update optimistically
        // (promote the version now) and fall back to the deferred-notification flow.
        await prisma.module.update({
          where: { id },
          data: {
            status: 'pending_deploy',
            version: release.tag,
            pendingVersion: null,
            updateAvailable: null,
            updateNotes: null,
          },
        })
        try {
          await clearAlert(`module-update:${id}`)
        } catch (err) {
          console.error('[modules] Failed to clear module-update notification:', err)
        }
        await recordDeploymentNeeded({ label: `Module '${mod.name}' updated to v${release.tag.replace(/^v/i, '')}` })
        return NextResponse.json({ ok: true, status: 'pending_deploy' })
      }
    } catch (err: unknown) {
      await prisma.module.update({
        where: { id },
        data: { status: 'failed', pendingVersion: null, lastError: err instanceof Error ? err.message : 'Update failed' },
      })
      await prisma.deployLock.deleteMany({ where: { id: 'singleton' } })
      return errorResponse(`Update failed: ${err instanceof Error ? err.message : 'Unknown'}`, 500)
    }

    return NextResponse.json({ ok: true, status: 'deploying', redeployTriggered: true })
  }

  return errorResponse('Unknown action')
}

const DeleteBody = z.object({
  mode: z.enum(['code_only', 'code_and_data']),
})

export async function DELETE(request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'modules.manage')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const mod = await prisma.module.findUnique({ where: { id } })
  if (!mod) return errorResponse('Module not found', 404)

  const ghConfigStatus = await getGitHubConfigStatus()
  if (ghConfigStatus === 'app_not_installed') {
    return errorResponse(
      'GitHub App is connected but not yet installed on a repository.',
      503
    )
  }
  if (ghConfigStatus === 'not_configured') {
    return errorResponse('GitHub is not configured. Cannot remove module from registry.', 503)
  }

  const parsed = DeleteBody.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input')

  const { mode } = parsed.data

  const lock = await prisma.deployLock.findUnique({ where: { id: 'singleton' } })
  if (lock) return errorResponse('Another install or update is in progress', 409)

  const manifest = mod.manifest as { teardown?: string[] } | null

  if (mode === 'code_and_data') {
    const teardown = manifest?.teardown
    if (!teardown || teardown.length === 0) {
      return errorResponse(
        'This module has not declared teardown tables. Use code_only mode instead.',
        400
      )
    }
  }

  await prisma.deployLock.create({
    data: { id: 'singleton', lockedBy: `module:uninstall:${mod.name}` },
  })

  const droppedTables: string[] = []

  try {
    // No git push here: the modules.json commit is deferred until "Redeploy now".
    // Deleting the DB row below removes it from the desired registry state.
    if (mode === 'code_and_data') {
      const teardown = (manifest?.teardown ?? []) as string[]
      for (const tableName of teardown) {
        await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${tableName}" CASCADE`)

        // Verify the table is gone
        const rows = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
          `SELECT table_name FROM information_schema.tables WHERE table_name = $1 AND table_schema = 'public'`,
          tableName
        )
        if (rows.length === 0) {
          droppedTables.push(tableName)
        } else {
          console.warn(`[uninstall] table "${tableName}" still exists after DROP — may not have been created yet`)
        }
      }
    }

    await prisma.$transaction([
      prisma.permission.deleteMany({ where: { module: mod.name } }),
      prisma.module.delete({ where: { id } }),
    ])

    await prisma.deployLock.deleteMany({ where: { id: 'singleton' } })

    // Module is gone - clear any lingering "update available" reminder for it.
    try {
      await clearAlert(`module-update:${id}`)
    } catch (err) {
      console.error('[modules] Failed to clear module-update notification:', err)
    }

    // Deleting the row above removes it from the desired registry. Commit modules.json
    // and redeploy immediately; the admin is sent to the redeploying screen.
    const { triggered } = await startDeferredRedeploy()
    if (!triggered) {
      // No Vercel creds: fall back to the deferred-notification flow.
      await recordDeploymentNeeded({ label: `Module '${mod.name}' uninstalled` })
      return NextResponse.json({ ok: true, droppedTables })
    }
  } catch (err: unknown) {
    await prisma.deployLock.deleteMany({ where: { id: 'singleton' } })
    return errorResponse(
      `Uninstall failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      500
    )
  }

  return NextResponse.json({ ok: true, droppedTables, redeployTriggered: true })
}

// Check for available updates (called periodically by the Modules page)
export async function GET(request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'modules.manage')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const mod = await prisma.module.findUnique({ where: { id } })
  if (!mod) return errorResponse('Module not found', 404)

  if (await getGitHubConfigStatus() !== 'configured') {
    return NextResponse.json({ updateAvailable: null, note: 'GitHub not configured' })
  }

  const release = await getLatestRelease(mod.repoUrl, mod.updateChannel as 'public' | 'beta')
  if (!release || release.tag === mod.version) {
    await prisma.module.update({
      where: { id },
      data: { lastCheckedAt: new Date() },
    })
    // No update: clear any lingering "update available" reminder for this module.
    try {
      await clearAlert(`module-update:${id}`)
    } catch (err) {
      console.error('[modules] Failed to clear module-update notification:', err)
    }
    return NextResponse.json({ updateAvailable: null })
  }

  await prisma.module.update({
    where: { id },
    data: {
      status: 'update_available',
      updateAvailable: release.tag,
      updateNotes: release.body,
      lastCheckedAt: new Date(),
    },
  })

  // Raise the on-demand per-module "update available" notification so the bell
  // persists the reminder across the admin. Never let this break the endpoint.
  try {
    await recordModuleUpdate({ moduleId: id, name: mod.name, latestVersion: release.tag.replace(/^v/i, '') })
  } catch (err) {
    console.error('[modules] Failed to record module-update notification:', err)
  }

  return NextResponse.json({ updateAvailable: release.tag, notes: release.body })
}
