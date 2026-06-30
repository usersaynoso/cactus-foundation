import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { commitSubmoduleUpdate, commitSubmoduleRemove, getLatestRelease, getLatestDeploymentStatus } from '@/lib/modules/github'
import { getGitHubConfigStatus } from '@/lib/config/env'
import { recordDeploymentNeeded } from '@/lib/notifications/deployment'

export const maxDuration = 60

const Patch = z.object({
  action: z.enum(['update', 'enable', 'disable', 'check-status']),
})

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'modules.manage')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const module = await prisma.module.findUnique({ where: { id } })
  if (!module) return errorResponse('Module not found', 404)

  const parsed = Patch.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input')

  const { action } = parsed.data

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
    if (module.status !== 'deploying') {
      return NextResponse.json({ status: module.status })
    }
    const deployStatus = await getLatestDeploymentStatus()
    if (deployStatus === 'READY') {
      await prisma.module.update({ where: { id }, data: { status: 'active' } })
      await prisma.deployLock.deleteMany({ where: { id: 'singleton' } })
      return NextResponse.json({ status: 'active' })
    } else if (deployStatus === 'ERROR') {
      await prisma.module.update({ where: { id }, data: { status: 'failed', lastError: 'Vercel deployment failed' } })
      await prisma.deployLock.deleteMany({ where: { id: 'singleton' } })
      return NextResponse.json({ status: 'failed' })
    }
    return NextResponse.json({ status: 'deploying' })
  }

  if (action === 'update') {
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

    const release = await getLatestRelease(module.repoUrl)
    if (!release) return errorResponse('No tagged releases found', 404)

    await prisma.deployLock.create({
      data: { id: 'singleton', lockedBy: `module:${module.name}` },
    })

    try {
      await commitSubmoduleUpdate({
        submodulePath: `modules/${module.name}`,
        commitSha: release.sha,
        message: `chore: update module ${module.name} to v${release.tag}\n\n[cactus-update]`,
      })

      await prisma.module.update({
        where: { id },
        data: { status: 'pending_deploy', updateAvailable: null, updateNotes: null, version: release.tag },
      })
      await prisma.deployLock.deleteMany({ where: { id: 'singleton' } })

      await recordDeploymentNeeded({ label: `Module '${module.name}' updated to v${release.tag}` })
    } catch (err: unknown) {
      await prisma.module.update({
        where: { id },
        data: { status: 'failed', lastError: err instanceof Error ? err.message : 'Update failed' },
      })
      await prisma.deployLock.deleteMany({ where: { id: 'singleton' } })
      return errorResponse(`Update failed: ${err instanceof Error ? err.message : 'Unknown'}`, 500)
    }

    return NextResponse.json({ ok: true, status: 'pending_deploy' })
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
  const module = await prisma.module.findUnique({ where: { id } })
  if (!module) return errorResponse('Module not found', 404)

  const ghConfigStatus = await getGitHubConfigStatus()
  if (ghConfigStatus === 'app_not_installed') {
    return errorResponse(
      'GitHub App is connected but not yet installed on a repository.',
      503
    )
  }
  if (ghConfigStatus === 'not_configured') {
    return errorResponse('GitHub is not configured. Cannot remove module submodule.', 503)
  }

  const parsed = DeleteBody.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input')

  const { mode } = parsed.data

  const lock = await prisma.deployLock.findUnique({ where: { id: 'singleton' } })
  if (lock) return errorResponse('Another install or update is in progress', 409)

  const manifest = module.manifest as { teardown?: string[] } | null

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
    data: { id: 'singleton', lockedBy: `module:uninstall:${module.name}` },
  })

  const droppedTables: string[] = []

  try {
    await commitSubmoduleRemove({
      submodulePath: `modules/${module.name}`,
      message: `chore: uninstall module ${module.name}\n\n[cactus-uninstall]`,
    })

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
      prisma.permission.deleteMany({ where: { module: module.name } }),
      prisma.module.delete({ where: { id } }),
    ])

    await prisma.deployLock.deleteMany({ where: { id: 'singleton' } })

    await recordDeploymentNeeded({ label: `Module '${module.name}' uninstalled` })
  } catch (err: unknown) {
    await prisma.deployLock.deleteMany({ where: { id: 'singleton' } })
    return errorResponse(
      `Uninstall failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      500
    )
  }

  return NextResponse.json({ ok: true, droppedTables })
}

// Check for available updates (called periodically by the Modules page)
export async function GET(request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'modules.manage')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const module = await prisma.module.findUnique({ where: { id } })
  if (!module) return errorResponse('Module not found', 404)

  if (await getGitHubConfigStatus() !== 'configured') {
    return NextResponse.json({ updateAvailable: null, note: 'GitHub not configured' })
  }

  const release = await getLatestRelease(module.repoUrl)
  if (!release || release.tag === module.version) {
    await prisma.module.update({
      where: { id },
      data: { lastCheckedAt: new Date() },
    })
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

  return NextResponse.json({ updateAvailable: release.tag, notes: release.body })
}
