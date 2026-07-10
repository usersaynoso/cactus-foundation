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
  validatePublicBasePathUnique,
} from '@/lib/modules/manifest'
import { getInstalledPublicBasePaths } from '@/lib/modules/public'
import { getLatestRelease } from '@/lib/modules/github'
import { getGitHubConfigStatus, isLocalMode } from '@/lib/config/env'
import { recordDeploymentNeeded } from '@/lib/notifications/deployment'
import { clearAlert } from '@/lib/notifications/alerts'
import { startDeferredRedeploy } from '@/lib/deploy/redeploy'
import { compareVersions } from '@/lib/updates/core'
import pkg from '@/package.json'

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
  channel: z.enum(['public', 'beta']).default('public'),
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

  const { repoUrl, channel } = parsed.data

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

  // Check the running core is new enough for this module. Installing anyway
  // would commit the module into modules.json and break the site's next build
  // on a missing core import - far worse than refusing here.
  if (manifest.requiresCoreVersion && compareVersions(pkg.version, manifest.requiresCoreVersion) < 0) {
    return errorResponse(
      `"${manifest.name}" needs Cactus v${manifest.requiresCoreVersion} or newer - this site is on v${pkg.version}. Update Cactus first from the update panel, then install the module.`,
      409
    )
  }

  // Check tablePrefix uniqueness
  const existing = await prisma.module.findMany({
    select: { tablePrefix: true, name: true, status: true, version: true },
  })
  try {
    validateTablePrefixUnique(manifest.tablePrefix, existing.map((m) => m.tablePrefix))
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Table prefix conflict')
  }

  // Check if already installed
  if (existing.some((m) => m.name === manifest.name)) {
    return errorResponse(`Module "${manifest.name}" is already installed`)
  }

  // Check publicBasePath uniqueness among installed modules, and against InfoPage slugs
  if (manifest.publicBasePath) {
    const moduleBases = await getInstalledPublicBasePaths()
    try {
      validatePublicBasePathUnique(manifest.publicBasePath, [...moduleBases.keys()])
    } catch (err: unknown) {
      return errorResponse(err instanceof Error ? err.message : 'Public base path conflict')
    }

    const collidingPage = await prisma.infoPage.findUnique({ where: { slug: manifest.publicBasePath } })
    if (collidingPage) {
      return errorResponse(
        `Slug "${manifest.publicBasePath}" is already in use by an existing page. Rename or remove that page first.`,
        409
      )
    }
  }

  // Check declared module dependencies are installed, active, and at minVersion+
  for (const dep of manifest.requiresModules) {
    const found = existing.find((m) => m.name === dep.name)
    if (!found || found.status !== 'active') {
      return errorResponse(
        `"${manifest.name}" requires the "${dep.name}" module (v${dep.minVersion}+) to be installed and active first.`
      )
    }
    if (compareVersions(found.version, dep.minVersion) < 0) {
      return errorResponse(
        `"${manifest.name}" requires "${dep.name}" v${dep.minVersion}+, but v${found.version.replace(/^v/i, '')} is installed. Update it first.`
      )
    }
  }

  // Channel chosen at install time; can be switched per-module afterwards.
  const release = await getLatestRelease(repoUrl, channel)
  if (!release) {
    return errorResponse(
      channel === 'beta'
        ? 'No releases (stable or pre-release) found in this repository. Publish a GitHub release first.'
        : 'No tagged releases found in this repository. Publish a GitHub release first.'
    )
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
        updateChannel: channel,
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

    // Commit modules.json and redeploy immediately: the git push auto-deploys, and the
    // admin is sent straight to the redeploying screen. The module ships as 'deploying'.
    await prisma.module.update({
      where: { name: manifest.name },
      data: { status: 'deploying', version: release.tag },
    })
    await prisma.deployLock.deleteMany({ where: { id: 'singleton' } })

    const { triggered } = await startDeferredRedeploy()
    if (!triggered) {
      // No Vercel creds: fall back to the deferred-notification flow.
      await prisma.module.update({
        where: { name: manifest.name },
        data: { status: 'pending_deploy' },
      })
      await recordDeploymentNeeded({ label: `Module '${manifest.name}' installed` })
      return NextResponse.json({ ok: true, name: manifest.name, status: 'pending_deploy' })
    }
  } catch (err: unknown) {
    await prisma.module.update({
      where: { name: manifest.name },
      data: { status: 'failed', lastError: err instanceof Error ? err.message : 'Unknown error' },
    })
    await prisma.deployLock.deleteMany({ where: { id: 'singleton' } })
    return errorResponse(`Install failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 500)
  }

  return NextResponse.json({ ok: true, name: manifest.name, status: 'deploying', redeployTriggered: true })
}

const BulkPatch = z.object({
  action: z.literal('update-all'),
})

// Updates every installed module with a pending release in a single deploy, rather
// than one push+build per module (which would also collide on the deploy lock).
export async function PATCH(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'modules.manage')) return errorResponse('Forbidden', 403)

  const parsed = BulkPatch.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input')

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

  const pending = await prisma.module.findMany({ where: { status: 'update_available' } })
  if (pending.length === 0) {
    return NextResponse.json({ ok: true, updated: 0, failed: [] })
  }

  await prisma.deployLock.create({ data: { id: 'singleton', lockedBy: 'modules:update-all' } })

  const updated: { id: string; name: string; tag: string }[] = []
  const failed: string[] = []

  try {
    for (const mod of pending) {
      const release = await getLatestRelease(mod.repoUrl, mod.updateChannel as 'public' | 'beta')
      if (!release) {
        failed.push(mod.name)
        continue
      }
      await prisma.module.update({
        where: { id: mod.id },
        data: { status: 'deploying', pendingVersion: release.tag, updateAvailable: null, updateNotes: null },
      })
      updated.push({ id: mod.id, name: mod.name, tag: release.tag })
    }
  } finally {
    await prisma.deployLock.deleteMany({ where: { id: 'singleton' } })
  }

  if (updated.length === 0) {
    return NextResponse.json({ ok: true, updated: 0, failed })
  }

  const { triggered } = await startDeferredRedeploy()
  if (!triggered) {
    // No Vercel creds: apply each update optimistically, same as the single-module path.
    for (const m of updated) {
      await prisma.module.update({
        where: { id: m.id },
        data: { status: 'pending_deploy', version: m.tag, pendingVersion: null, updateAvailable: null, updateNotes: null },
      })
      try {
        await clearAlert(`module-update:${m.id}`)
      } catch (err) {
        console.error('[modules] Failed to clear module-update notification:', err)
      }
    }
    const [first] = updated
    await recordDeploymentNeeded({
      label: updated.length === 1 && first
        ? `Module '${first.name}' updated to v${first.tag.replace(/^v/i, '')}`
        : `${updated.length} modules updated`,
    })
    return NextResponse.json({ ok: true, updated: updated.length, failed, status: 'pending_deploy' })
  }

  return NextResponse.json({ ok: true, updated: updated.length, failed, status: 'deploying', redeployTriggered: true })
}
