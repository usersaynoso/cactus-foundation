import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import {
  fetchManifestFromRepo,
  parseModuleManifest,
  parseGitHubRepo,
  validateTablePrefixUnique,
} from '@/lib/modules/manifest'
import { commitSubmoduleAdd, getLatestRelease } from '@/lib/modules/github'
import { getGitHubConfigStatus } from '@/lib/config/env'
import { recordDeploymentNeeded } from '@/lib/notifications/deployment'

export const maxDuration = 60

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'modules.manage')) return errorResponse('Forbidden', 403)

  const modules = await prisma.module.findMany({ orderBy: { installedAt: 'asc' } })
  return NextResponse.json({ modules })
}

const InstallBody = z.object({
  repoUrl: z.string().url(),
})

export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'modules.manage')) return errorResponse('Forbidden', 403)

  const ghConfigStatus = await getGitHubConfigStatus()
  if (ghConfigStatus === 'app_not_installed') {
    return errorResponse(
      'GitHub App is connected but not yet installed on a repository. Go to Settings → Integrations and click "Install app on repository".',
      503
    )
  }
  if (ghConfigStatus === 'not_configured') {
    return errorResponse(
      'GitHub is not configured. Connect a GitHub App or set GITHUB_API_TOKEN to install modules.',
      503
    )
  }

  const parsed = InstallBody.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input')

  const { repoUrl } = parsed.data

  // Check deploy lock
  const lock = await prisma.deployLock.findUnique({ where: { id: 'singleton' } })
  if (lock) {
    return errorResponse('Another install or update is in progress. Please wait.', 409)
  }

  // Fetch and validate the manifest
  let manifest
  try {
    const raw = await fetchManifestFromRepo(repoUrl, 'cactus.module.json')
    manifest = parseModuleManifest(raw)
  } catch (err: unknown) {
    return errorResponse(`Manifest error: ${err instanceof Error ? err.message : 'Unknown error'}`)
  }

  // Check tablePrefix uniqueness
  const existing = await prisma.module.findMany({ select: { tablePrefix: true, name: true } })
  try {
    validateTablePrefixUnique(manifest.tablePrefix, existing.map((m) => m.tablePrefix))
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Table prefix conflict')
  }

  // Check if already installed
  if (existing.some((m) => m.name === manifest.name)) {
    return errorResponse(`Module "${manifest.name}" is already installed`)
  }

  // Get the latest release SHA
  const release = await getLatestRelease(repoUrl)
  if (!release) {
    return errorResponse('No tagged releases found in this repository. Publish a GitHub release first.')
  }

  // Check required env vars
  const missingRequired = manifest.requiredEnvVars
    .filter((v) => v.required && !process.env[v.name])
    .map((v) => v.name)

  if (missingRequired.length > 0) {
    return errorResponse(
      `Missing required environment variables: ${missingRequired.join(', ')}. Add them before installing.`
    )
  }

  // Acquire deploy lock and create the module row
  const { owner, repo } = parseGitHubRepo(repoUrl)
  const submodulePath = `modules/${manifest.name}`

  await prisma.$transaction([
    prisma.deployLock.create({
      data: { id: 'singleton', lockedBy: `module:${manifest.name}` },
    }),
    prisma.module.create({
      data: {
        name: manifest.name,
        repoUrl,
        version: release.tag,
        tablePrefix: manifest.tablePrefix,
        status: 'pending_install',
        manifest: manifest as object,
      },
    }),
  ])

  try {
    // Register permissions declared by this module
    await Promise.all(
      manifest.permissions.map((key) =>
        prisma.permission.upsert({
          where: { key },
          create: { key, description: key, module: manifest.name },
          update: {},
        })
      )
    )

    // Commit submodule via GitHub API
    await commitSubmoduleAdd({
      submodulePath,
      submoduleUrl: repoUrl,
      commitSha: release.sha,
      message: `chore: install module ${manifest.name} v${release.tag}\n\n[cactus-install]`,
    })

    await prisma.module.update({
      where: { name: manifest.name },
      data: { status: 'pending_deploy', version: release.tag },
    })
    await prisma.deployLock.deleteMany({ where: { id: 'singleton' } })

    await recordDeploymentNeeded({ label: `Module '${manifest.name}' installed` })
  } catch (err: unknown) {
    await prisma.module.update({
      where: { name: manifest.name },
      data: { status: 'failed', lastError: err instanceof Error ? err.message : 'Unknown error' },
    })
    await prisma.deployLock.deleteMany({ where: { id: 'singleton' } })
    return errorResponse(`Install failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 500)
  }

  return NextResponse.json({ ok: true, name: manifest.name, status: 'pending_deploy' })
}
