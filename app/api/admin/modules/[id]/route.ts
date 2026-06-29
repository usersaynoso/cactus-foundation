import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { commitSubmoduleUpdate, getLatestRelease, getLatestDeploymentStatus } from '@/lib/modules/github'
import { getGitHubConfigStatus } from '@/lib/config/env'

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
        data: { status: 'deploying', updateAvailable: null, updateNotes: null },
      })
    } catch (err: unknown) {
      await prisma.module.update({
        where: { id },
        data: { status: 'failed', lastError: err instanceof Error ? err.message : 'Update failed' },
      })
      await prisma.deployLock.deleteMany({ where: { id: 'singleton' } })
      return errorResponse(`Update failed: ${err instanceof Error ? err.message : 'Unknown'}`, 500)
    }

    return NextResponse.json({ ok: true, status: 'deploying' })
  }

  return errorResponse('Unknown action')
}

// Check for available updates (called periodically by the Modules page)
export async function GET(request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'modules.manage')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const module = await prisma.module.findUnique({ where: { id } })
  if (!module) return errorResponse('Module not found', 404)

  if (!await isGitHubConfigured()) {
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
