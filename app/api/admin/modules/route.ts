import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import {
  fetchManifestFromRepo,
  parseModuleManifest,
  readDeclaredCoreVersion,
  parseGitHubRepo,
  formatModuleDisplayName,
  validateTablePrefixUnique,
  validatePublicBasePathUnique,
} from '@/lib/modules/manifest'
import { findUnmetModuleDependencies } from '@/lib/modules/dependencies'
import {
  fetchModuleRequirements,
  resolveUpdateBatch,
  type UpdateCandidate,
} from '@/lib/modules/compat'
import { getInstalledPublicBasePaths } from '@/lib/modules/public'
import { getLatestRelease } from '@/lib/modules/github'
import { getGithubClient, getGithubConnectionStatus } from '@/lib/github/client'
import { getGitHubConfigStatus, isLocalMode } from '@/lib/config/env'
import { recordDeploymentNeeded } from '@/lib/notifications/deployment'
import { clearAlert } from '@/lib/notifications/alerts'
import { startDeferredRedeploy } from '@/lib/deploy/redeploy'
import { ensureCronSecret, cronSecretSatisfied } from '@/lib/vercel/cron-secret'
import { getActiveDeployLock, acquireDeployLock, lockBusyMessage, LOCK_RACE_MESSAGE, DEFAULT_LOCK_HOLD_MS } from '@/lib/deploy/lock'
import { getDeployInFlight, deployInFlightMessage } from '@/lib/deploy/in-flight'
import { settleFinishedDeploy } from '@/lib/deploy/reconcile'
import {
  compareVersions,
  getCoreUpdateStatus,
  syncCoreFromUpstream,
  invalidateCoreUpdateCache,
} from '@/lib/updates/core'
import {
  assertWithinDeadline,
  deadlineFromNow,
  isDeadlineError,
  ROUTE_WORK_BUDGET_MS,
} from '@/lib/updates/deadline'
import { gitHubOutageNote } from '@/lib/github/health'
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
  // The "bring everything else along" checkboxes on the install dialog. Both ride in
  // the SAME commit (and therefore the same build) as the install, which is the whole
  // point: one deploy instead of three, and a module whose new version needs a newer
  // core or sibling becomes installable in one go rather than after two waits.
  updateCore: z.boolean().optional(),
  updateModules: z.boolean().optional(),
})

// The Module row shape carried through the bundled-update batch below.
type PendingModuleRow = {
  id: string
  name: string
  repoUrl: string
  updateAvailable: string | null
  updateNotes: string | null
}

export async function POST(request: NextRequest) {
  // The 60s ceiling starts here: bundling updates in spends extra GitHub round trips
  // before anything is pushed, so the work budget has to be measured from the top of
  // the handler rather than from where the core sync begins.
  const routeStartedAt = Date.now()

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
  const updateCore = parsed.data.updateCore ?? false
  const updateModules = parsed.data.updateModules ?? false

  // Validate the URL shape before any lock or network call. `repoUrl` is only
  // z.string().url() above, and a well-formed URL that is not a GitHub repo
  // used to travel into getLatestRelease and surface as an unhandled 500.
  // Custom modules arrive from a pasted URL box, so this is now a common path.
  let repoRef: { owner: string; repo: string }
  try {
    repoRef = parseGitHubRepo(repoUrl)
  } catch {
    return errorResponse(
      'That is not a GitHub repository address. Paste the full URL of the repo, e.g. https://github.com/your-account/your-module.'
    )
  }

  // Probe the repo before resolving a release. The common failure for a custom
  // module is not "no releases" - it is that this site's GitHub credentials
  // cannot see the repo at all, and GitHub reports a private repo it cannot see
  // as 404. Without this probe that case surfaces as "publish a release first",
  // sending the owner hunting for a release that already exists.
  let repoIsPrivate = false
  try {
    const octokit = await getGithubClient()
    const { data: probed } = await octokit.rest.repos.get({ owner: repoRef.owner, repo: repoRef.repo })
    repoIsPrivate = probed.private
  } catch (err: unknown) {
    if ((err as { status?: number }).status === 404) {
      return errorResponse(
        `Cactus cannot see ${repoRef.owner}/${repoRef.repo} on GitHub. If the repository is private, install the Cactus GitHub App on the account that owns it and grant it access to that repository (on GitHub: Settings → Applications → the app → Configure), then try again. If it is public, check the address for typos.`
      )
    }
    // Any other probe failure (rate limit, transient network): fall through -
    // the release resolution below has its own error handling, and a blip here
    // should not invent a scarier message.
  }

  // Refuse a private repo the build cannot clone. Installing it anyway would
  // commit the module into modules.json and break the site's next deploy at
  // the checkout step - far worse than refusing here (the same reasoning as
  // the requiresCoreVersion check below). The build fetches module code with,
  // in order: MODULE_CLONE_TOKEN, the GitHub App connection, GITHUB_API_TOKEN
  // (see scripts/checkout-modules.mjs).
  if (repoIsPrivate && !process.env.MODULE_CLONE_TOKEN && !process.env.GITHUB_API_TOKEN) {
    const { state } = await getGithubConnectionStatus()
    if (state !== 'ready') {
      return errorResponse(
        `${repoRef.owner}/${repoRef.repo} is private, and this site has no credential its deploys could fetch the code with - the install would break the next deploy. Connect a GitHub App under Settings → Integrations (and grant it access to the repository), or set the MODULE_CLONE_TOKEN environment variable to a token that can read it.`
      )
    }
  }

  // Check deploy lock (a lock stranded by a hard-killed function is treated as
  // stale and cleared, so a crashed install doesn't block every future one).
  const lock = await getActiveDeployLock()
  if (lock) {
    return errorResponse(lockBusyMessage(lock), 409)
  }

  // Settle whatever the LAST build left behind before this one writes pins. A row
  // stranded in 'deploying' by a failed build still hands out its pendingVersion,
  // so without this the update re-pins the tag that broke the previous build.
  await settleFinishedDeploy()

  // And the build the last one started, which outlives that lock by minutes.
  const inFlight = await getDeployInFlight()
  if (inFlight) {
    return errorResponse(deployInFlightMessage(inFlight), 409)
  }

  // What this install gets judged against. Ticking "update Cactus too" moves the bar
  // to the version this deploy is MOVING TO, not the one running: core files and
  // modules.json land in one commit, so a module that needs the incoming core is
  // satisfied by the very build that carries it. Same reasoning as the core-update
  // route's module bundling, in the other direction.
  let coreTarget: { currentVersion: string; latestVersion: string } | null = null
  if (updateCore) {
    // Updating Cactus itself is a config.manage job. Without this check, modules.manage
    // alone would be enough to push a core update through the install button.
    if (!await hasPermission(user, 'config.manage')) {
      return errorResponse(
        'Updating Cactus needs the settings permission. Install the module on its own, or ask an administrator to update Cactus first.',
        403
      )
    }
    const cfg = await prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { coreUpdateChannel: true },
    })
    const coreChannel = (cfg?.coreUpdateChannel ?? 'public') as 'public' | 'beta'
    const coreStatus = await getCoreUpdateStatus({ channel: coreChannel })
    if (
      !('localMode' in coreStatus) &&
      coreStatus.configured &&
      'updateAvailable' in coreStatus &&
      coreStatus.updateAvailable
    ) {
      coreTarget = { currentVersion: coreStatus.currentVersion, latestVersion: coreStatus.latestVersion }
    }
    // Nothing to bundle (local mode, no GitHub, or already current): carry on and
    // install on its own rather than failing over a checkbox.
  }
  const effectiveCoreVersion = coreTarget?.latestVersion ?? pkg.version

  // Resolve the release first: the manifest is read AT this tag (not HEAD), so
  // every check below judges the exact version about to be installed.
  // Channel chosen at install time; can be switched per-module afterwards.
  const release = await getLatestRelease(repoUrl, channel)
  if (!release) {
    return errorResponse(
      channel === 'beta'
        ? 'No releases (stable or pre-release) found in this repository. Publish a GitHub release first.'
        : 'No tagged releases found in this repository. Publish a GitHub release first.'
    )
  }

  // Fetch the manifest at the tag being installed.
  let raw: unknown
  try {
    raw = await fetchManifestFromRepo(repoUrl, 'cactus.module.json', release.tag)
  } catch (err: unknown) {
    return errorResponse(`Manifest error: ${err instanceof Error ? err.message : 'Unknown error'}`)
  }

  // Check the running core is new enough BEFORE validating the rest of the
  // manifest. Installing anyway would commit the module into modules.json and
  // break the site's next build on a missing core import - far worse than
  // refusing here. The order matters as much as the check: a module built
  // against a newer core may use a manifest field this core's schema has never
  // heard of, which is precisely what requiresCoreVersion is for, and parsing
  // first answered "update Cactus" with a page of validator internals about a
  // field the owner has never seen.
  const declaredCoreVersion = readDeclaredCoreVersion(raw)
  if (declaredCoreVersion && compareVersions(effectiveCoreVersion, declaredCoreVersion) < 0) {
    const displayName = formatModuleDisplayName(repoUrl)
    return NextResponse.json(
      {
        error: coreTarget
          // They ticked the box and it still isn't enough - say so, or the message
          // sends them off to do the very update this install already offered.
          ? `"${displayName}" needs Cactus v${declaredCoreVersion} or newer. The newest Cactus available is v${coreTarget.latestVersion}, so updating first would still not be enough - try again once a newer Cactus is out.`
          : `"${displayName}" needs Cactus v${declaredCoreVersion} or newer - this site is on v${pkg.version}. Update Cactus first from the update panel, then install the module.`,
        code: 'core_version_required',
        moduleName: displayName,
        requiredVersion: declaredCoreVersion,
        currentVersion: pkg.version,
      },
      { status: 409 }
    )
  }

  // Core is new enough, so anything the schema rejects now is a genuine fault
  // in the manifest rather than this core being behind.
  let manifest
  try {
    manifest = parseModuleManifest(raw)
  } catch (err: unknown) {
    return errorResponse(`Manifest error: ${err instanceof Error ? err.message : 'Unknown error'}`)
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

  // Give the bundled work a budget that ends a little before this function's 60s
  // ceiling, net of what the checks above already spent. A GitHub slow spell then
  // produces a real message and a released lock rather than a hard kill.
  const deadlineAt = deadlineFromNow(ROUTE_WORK_BUDGET_MS - (Date.now() - routeStartedAt))

  // Which of the OTHER modules' pending updates can ride along in this install's build.
  // Resolved before the new module's own requiresModules gate on purpose: a sibling that
  // merely needs updating to satisfy it is then judged at the version this deploy will
  // carry, so "install X and update everything else" works in one deploy instead of
  // refusing with "update it first".
  let acceptedUpdates: UpdateCandidate<PendingModuleRow>[] = []
  const skippedUpdates: string[] = []
  if (updateModules) {
    // Nothing has been written yet, so a GitHub failure (or the deadline running out)
    // here is a clean "try again", not a half-done install.
    try {
      const pendingRows = await prisma.module.findMany({
        where: { status: 'update_available' },
        select: { id: true, name: true, repoUrl: true, updateAvailable: true, updateNotes: true, updateChannel: true },
      })
      const candidates: UpdateCandidate<PendingModuleRow>[] = []
      for (const mod of pendingRows) {
        assertWithinDeadline(deadlineAt, 'checking the other modules for updates')
        const modRelease = await getLatestRelease(mod.repoUrl, mod.updateChannel as 'public' | 'beta')
        if (!modRelease) {
          skippedUpdates.push(`${formatModuleDisplayName(mod.repoUrl)}: no release found`)
          continue
        }
        candidates.push({
          module: mod,
          name: mod.name,
          tag: modRelease.tag,
          // Read AT the tag being installed, not HEAD, so the requirements judged are
          // the ones that version actually ships with.
          requirements: await fetchModuleRequirements(mod.repoUrl, modRelease.tag),
        })
      }
      // Same compat gate as "Update all": an incoming version needing a newer core or
      // sibling must never reach modules.json, or it takes this install's build down
      // with it. Judged against the core this deploy will carry.
      const { accepted, blocked } = resolveUpdateBatch({
        candidates,
        coreVersion: effectiveCoreVersion,
        installed: existing,
      })
      acceptedUpdates = accepted
      for (const b of blocked) {
        skippedUpdates.push(`${formatModuleDisplayName(b.candidate.module.repoUrl)}: ${b.reason}`)
      }
    } catch (err: unknown) {
      return errorResponse(
        isDeadlineError(err)
          ? (err as Error).message
          : `Couldn't check the other modules for updates: ${err instanceof Error ? err.message : 'Unknown error'}. Nothing was changed - try again, or install without updating the others.`,
        503
      )
    }
  }

  // Check declared module dependencies are installed, active, and at minVersion+.
  // Anything the batch above accepted counts at its NEW version - it lands in the
  // same commit as this install.
  const installedForDeps = existing.map((m) => {
    const bumped = acceptedUpdates.find((c) => c.name === m.name)
    return bumped ? { ...m, version: bumped.tag } : m
  })
  const [unmet] = findUnmetModuleDependencies(manifest.requiresModules, installedForDeps)
  if (unmet) {
    return errorResponse(
      unmet.reason === 'missing'
        ? `"${manifest.name}" requires the "${unmet.name}" module (v${unmet.minVersion}+) to be installed and active first.`
        : `"${manifest.name}" requires "${unmet.name}" v${unmet.minVersion}+, but v${unmet.installedVersion.replace(/^v/i, '')} is installed. Update it first.`
    )
  }

  // Any module that schedules work needs CRON_SECRET, whether or not its manifest
  // bothers to declare it - without one, Vercel's scheduled request arrives with no
  // bearer token and every cron route answers 503. That failure is invisible (nothing
  // reaches the admin), so mint the secret at install time rather than leaving the
  // schedule quietly dead. See lib/vercel/cron-secret.ts for why this one is ours to
  // generate. The redeploy this install triggers is what puts it in process.env.
  const needsCronSecret =
    manifest.cronJobs.length > 0 ||
    manifest.requiredEnvVars.some((v) => v.name === 'CRON_SECRET')
  const cronSecret = needsCronSecret ? await ensureCronSecret() : null

  // Check required env vars. CRON_SECRET drops out of the list once provisioning has
  // dealt with it; a genuine 'unavailable' still blocks, since then nothing will run.
  const missingRequired = manifest.requiredEnvVars
    .filter((v) => v.required && !process.env[v.name])
    .filter((v) => !(v.name === 'CRON_SECRET' && cronSecret !== null && cronSecretSatisfied(cronSecret)))
    .map((v) => v.name)

  if (missingRequired.length > 0) {
    return errorResponse(
      `Missing required environment variables: ${missingRequired.join(', ')}. Add them before installing.`
    )
  }

  // Acquire deploy lock and create the module row
  await prisma.$transaction([
    prisma.deployLock.create({
      data: {
        id: 'singleton',
        lockedBy: `module:${manifest.name}`,
        expiresAt: new Date(Date.now() + DEFAULT_LOCK_HOLD_MS),
      },
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

    // Queue the accepted sibling updates into the SAME build this install triggers.
    // Reconciled to 'active' by the redeploying-screen poll / webhook once the deploy
    // lands (lib/deploy/reconcile.ts), exactly as a solo module update is.
    for (const c of acceptedUpdates) {
      await prisma.module.update({
        where: { id: c.module.id },
        data: { status: 'deploying', pendingVersion: c.tag, updateAvailable: null, updateNotes: null, deployId: 'pending' },
      })
    }

    // Commit modules.json and redeploy immediately: the git push auto-deploys, and the
    // admin sees live deploy status in the shell. The module ships as 'deploying'.
    await prisma.module.update({
      where: { name: manifest.name },
      data: { status: 'deploying', version: release.tag, deployId: 'pending' },
    })

    // With a core update bundled in, the core sync is what does the committing: it
    // pushes the core files AND modules.json in one commit, so it has to carry every
    // module's pin - the one being installed and any update queued above included.
    // startDeferredRedeploy is then told to adopt that push's build rather than
    // committing a second time and deploying twice.
    let committedSince: number | undefined
    if (coreTarget) {
      const deployStartedAt = Date.now()
      const allModules = await prisma.module.findMany({
        where: { status: { notIn: ['failed', 'inactive'] } },
      })
      await syncCoreFromUpstream(
        coreTarget.currentVersion,
        coreTarget.latestVersion,
        allModules.map((m) => ({
          name: m.name,
          repoUrl: m.repoUrl,
          version: m.pendingVersion ?? m.version,
          lastFailedVersion: m.lastFailedVersion,
        })),
        { deadlineAt }
      )
      // So the update panel reflects the version being deployed rather than a cached
      // "update available" for the one already going up.
      invalidateCoreUpdateCache()
      committedSince = deployStartedAt
    }

    await prisma.deployLock.deleteMany({ where: { id: 'singleton' } })

    const { triggered } = await startDeferredRedeploy(
      committedSince !== undefined ? { committedSince } : {}
    )
    if (!triggered) {
      // No Vercel creds: fall back to the deferred-notification flow, promoting the
      // queued updates optimistically (same as the "Update all" path) so they aren't
      // stranded in 'deploying' with no deploy left to reconcile them.
      await prisma.module.update({
        where: { name: manifest.name },
        data: { status: 'pending_deploy', deployId: null },
      })
      for (const c of acceptedUpdates) {
        await prisma.module.update({
          where: { id: c.module.id },
          data: { status: 'pending_deploy', version: c.tag, pendingVersion: null, updateAvailable: null, updateNotes: null, deployId: null },
        })
        try {
          await clearAlert(`module-update:${c.module.id}`)
        } catch (err) {
          console.error('[modules] Failed to clear module-update notification:', err)
        }
      }
      await recordDeploymentNeeded({ label: `Module '${manifest.name}' installed` })
      return NextResponse.json({
        ok: true,
        name: manifest.name,
        status: 'pending_deploy',
        coreUpdatedTo: coreTarget?.latestVersion ?? null,
        moduleUpdatesQueued: acceptedUpdates.length,
        moduleUpdatesSkipped: skippedUpdates,
      })
    }
  } catch (err: unknown) {
    // Nothing was pushed (or the push itself failed), so put the queued rows back
    // where they were - otherwise they sit in 'deploying' with no deploy coming.
    for (const c of acceptedUpdates) {
      await prisma.module.update({
        where: { id: c.module.id },
        data: {
          status: 'update_available',
          pendingVersion: null,
          updateAvailable: c.module.updateAvailable ?? c.tag,
          updateNotes: c.module.updateNotes,
          deployId: null,
        },
      })
    }
    await prisma.module.update({
      where: { name: manifest.name },
      data: { status: 'failed', lastError: err instanceof Error ? err.message : 'Unknown error' },
    })
    await prisma.deployLock.deleteMany({ where: { id: 'singleton' } })

    // Ask GitHub whether GitHub is the problem, same as the core-update route: a live
    // outage turns "Install failed: 502" into something the owner can act on.
    const base = err instanceof Error ? err.message : 'Unknown error'
    let note = ''
    try {
      note = await gitHubOutageNote()
    } catch { /* status page unreachable: report the raw failure alone */ }

    return errorResponse(
      note ? `Install failed: ${base} ${note}` : `Install failed: ${base}`,
      isDeadlineError(err) || note ? 503 : 500
    )
  }

  return NextResponse.json({
    ok: true,
    name: manifest.name,
    status: 'deploying',
    redeployTriggered: true,
    coreUpdatedTo: coreTarget?.latestVersion ?? null,
    moduleUpdatesQueued: acceptedUpdates.length,
    moduleUpdatesSkipped: skippedUpdates,
  })
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

  // Settle whatever the LAST build left behind before this one writes pins. A row
  // stranded in 'deploying' by a failed build still hands out its pendingVersion,
  // so without this the update re-pins the tag that broke the previous build.
  await settleFinishedDeploy()

  const lock = await getActiveDeployLock()
  if (lock) return errorResponse(lockBusyMessage(lock), 409)

  const inFlight = await getDeployInFlight()
  if (inFlight) return errorResponse(deployInFlightMessage(inFlight), 409)

  const pending = await prisma.module.findMany({ where: { status: 'update_available' } })
  if (pending.length === 0) {
    return NextResponse.json({ ok: true, updated: 0, failed: [] })
  }

  // The installed set as it stands BEFORE this batch - the starting point
  // resolveUpdateBatch grows as it accepts modules, so a chain released together
  // can satisfy itself inside one build. Mirrors the single-module update path's
  // requiresModules check otherwise.
  const installed = await prisma.module.findMany({
    select: { name: true, version: true, status: true },
  })

  if (!await acquireDeployLock('modules:update-all')) return errorResponse(LOCK_RACE_MESSAGE, 409)

  const updated: { id: string; name: string; tag: string }[] = []
  const failed: string[] = []

  try {
    // Resolve each candidate's release and declared requirements ONCE.
    // resolveUpdateBatch re-judges them across rounds and must not re-fetch.
    const candidates: UpdateCandidate<(typeof pending)[number]>[] = []
    for (const mod of pending) {
      const release = await getLatestRelease(mod.repoUrl, mod.updateChannel as 'public' | 'beta')
      if (!release) {
        failed.push(mod.name)
        continue
      }
      candidates.push({
        module: mod,
        name: mod.name,
        tag: release.tag,
        // Read AT the tag being installed, not HEAD, so the requirements judged
        // are the ones that version actually ships with.
        requirements: await fetchModuleRequirements(mod.repoUrl, release.tag),
      })
    }

    // Same compat gate the single-module path runs: an incoming version that
    // needs a newer core or sibling module would break the site's next build on
    // a missing import. Drop it from this batch (never write it to modules.json)
    // and report why, instead of pinning every latest tag blindly - but let the
    // batch satisfy its own chain, since it all ships in one commit.
    const { accepted, blocked } = resolveUpdateBatch({
      candidates,
      coreVersion: pkg.version,
      installed,
    })

    for (const b of blocked) {
      failed.push(`${formatModuleDisplayName(b.candidate.module.repoUrl)}: ${b.reason}`)
    }

    for (const c of accepted) {
      await prisma.module.update({
        where: { id: c.module.id },
        data: { status: 'deploying', pendingVersion: c.tag, updateAvailable: null, updateNotes: null, deployId: 'pending' },
      })
      updated.push({ id: c.module.id, name: c.module.name, tag: c.tag })
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
        data: { status: 'pending_deploy', version: m.tag, pendingVersion: null, updateAvailable: null, updateNotes: null, deployId: null },
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
