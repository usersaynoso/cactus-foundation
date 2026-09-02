import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { getLatestRelease, getLatestDeploymentStatus } from '@/lib/modules/github'
import { getGitHubConfigStatus, isLocalMode } from '@/lib/config/env'
import {
  compareVersions,
  getCoreUpdateStatus,
  syncCoreFromUpstream,
  invalidateCoreUpdateCache,
} from '@/lib/updates/core'
import {
  fetchModuleRequirements,
  resolveUpdateBatch,
  type UpdateCandidate,
} from '@/lib/modules/compat'
import {
  assertWithinDeadline,
  deadlineFromNow,
  isDeadlineError,
  ROUTE_WORK_BUDGET_MS,
} from '@/lib/updates/deadline'
import { gitHubOutageNote } from '@/lib/github/health'
import { recordDeploymentNeeded } from '@/lib/notifications/deployment'
import { recordModuleUpdate, clearAlert } from '@/lib/notifications/alerts'
import { startDeferredRedeploy } from '@/lib/deploy/redeploy'
import { getActiveDeployLock, acquireDeployLock, lockBusyMessage, LOCK_RACE_MESSAGE } from '@/lib/deploy/lock'
import { getDeployInFlight, deployInFlightMessage, deploymentStatusForReconcile } from '@/lib/deploy/in-flight'
import { markModulesDeploySucceeded, markModulesDeployFailed } from '@/lib/deploy/reconcile'
import { fetchManifestFromRepo, parseModuleManifest, readDeclaredCoreVersion, formatModuleDisplayName, type ModuleManifest } from '@/lib/modules/manifest'
import { findUnmetModuleDependencies } from '@/lib/modules/dependencies'
import { pruneUninstalledModuleLayouts } from '@/lib/setup/starterLayouts'
import pkg from '@/package.json'

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
    // Key the check on THIS module's own deployment. It used to read
    // SiteConfig.pendingRedeployId, which doubles as the admin's live status marker
    // and self-expires after four minutes - shorter than a slow build. Once expired
    // it read null, and getLatestDeploymentStatus(null) quietly answers about
    // "whatever landed most recently on this project" instead. A build belonging to
    // somebody else could then promote a pendingVersion whose code was never
    // deployed, or roll back an update that was perfectly healthy.
    //
    // Module.deployId outlives that expiry: it is cleared only when this module is
    // actually reconciled. The site marker is still the fallback for a row queued by
    // an older build with no deployId of its own.
    const cfg = await prisma.siteConfig.findFirst({
      select: { pendingRedeployId: true, pendingRedeployAt: true },
    })
    const trackedId = mod.deployId && mod.deployId !== 'pending'
      ? mod.deployId
      : cfg?.pendingRedeployId
    // deploymentStatusForReconcile, not getLatestDeploymentStatus: during the few
    // seconds between the redeploy sentinel being written and the real deployment
    // id being polled back, BOTH ids read 'pending', and the newest deployment on
    // the project is still the previous, successful one. Answering from that
    // promotes this module off a build that never carried it.
    const deployStatus = await deploymentStatusForReconcile({
      trackedId,
      since: cfg?.pendingRedeployAt,
    })
    if (deployStatus === 'READY') {
      await markModulesDeploySucceeded(trackedId)
      await prisma.deployLock.deleteMany({ where: { id: 'singleton' } })
      const refreshed = await prisma.module.findUnique({ where: { id }, select: { status: true } })
      return NextResponse.json({ status: refreshed?.status ?? 'active' })
    } else if (deployStatus === 'ERROR') {
      await markModulesDeployFailed('Vercel deployment failed', trackedId)
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

    const lock = await getActiveDeployLock()
    if (lock) return errorResponse(lockBusyMessage(lock), 409)

    // And the build the last update started, which outlives that lock by minutes.
    const inFlight = await getDeployInFlight()
    if (inFlight) return errorResponse(deployInFlightMessage(inFlight), 409)

    const release = await getLatestRelease(mod.repoUrl, mod.updateChannel as 'public' | 'beta')
    if (!release) return errorResponse('No tagged releases found', 404)

    // A newer module version may need a newer core (requiresCoreVersion) or a
    // newer sibling module (requiresModules) - updating anyway would break the
    // site's next build on a missing import. Skipped silently if the manifest
    // can't be fetched, so a transient GitHub hiccup never blocks an
    // otherwise-fine update.
    // Read the manifest AT the tag being installed, not HEAD - otherwise the
    // requiresCoreVersion / requiresModules checks below judge unreleased code.
    let rawIncoming: unknown
    try {
      rawIncoming = await fetchManifestFromRepo(mod.repoUrl, 'cactus.module.json', release.tag)
    } catch (err) {
      console.warn(`[modules] Could not fetch the manifest to pre-check requirements for ${mod.name}:`, err)
    }

    // The core-version gate reads the RAW manifest, deliberately, and runs
    // before validation. A newer module version may legitimately use a manifest
    // field this core's schema has never heard of - that is what
    // requiresCoreVersion is for - and this used to parse first and swallow the
    // failure, which left `incoming` undefined and skipped the gate entirely.
    // The update then went ahead and broke the site's next build on an import
    // the running core has not got, which is the exact outcome the gate exists
    // to prevent.
    const requiresCoreVersion = readDeclaredCoreVersion(rawIncoming)
    if (requiresCoreVersion && compareVersions(pkg.version, requiresCoreVersion) < 0) {
      const displayName = formatModuleDisplayName(mod.repoUrl)
      return NextResponse.json(
        {
          error: `The new version of "${displayName}" needs Cactus v${requiresCoreVersion} or newer - this site is on v${pkg.version}. Update Cactus first from the update panel, then update the module.`,
          code: 'core_version_required',
          moduleName: displayName,
          requiredVersion: requiresCoreVersion,
          currentVersion: pkg.version,
        },
        { status: 409 }
      )
    }

    // Validated only once the core version is known to be sufficient. Still
    // tolerant of a parse failure, as before: the sibling-module checks below
    // are a courtesy, and a transient GitHub hiccup should not block an
    // otherwise-fine update. The check that must never be skipped is above.
    let incoming: ModuleManifest | undefined
    if (rawIncoming !== undefined) {
      try {
        incoming = parseModuleManifest(rawIncoming)
      } catch (err) {
        console.warn(`[modules] Could not pre-check sibling requirements for ${mod.name}:`, err)
      }
    }

    if (incoming) {
      const installed = await prisma.module.findMany({
        select: { name: true, version: true, status: true, repoUrl: true },
      })
      const [unmet] = findUnmetModuleDependencies(incoming.requiresModules, installed)
      if (unmet) {
        const displayName = formatModuleDisplayName(mod.repoUrl)
        const depRepoUrl = installed.find((m) => m.name === unmet.name)?.repoUrl
        const depName = depRepoUrl ? formatModuleDisplayName(depRepoUrl) : unmet.name
        const currentVersion = unmet.reason === 'outdated' ? unmet.installedVersion.replace(/^v/i, '') : null
        return NextResponse.json(
          {
            error: unmet.reason === 'outdated'
              ? `The new version of "${displayName}" needs "${depName}" v${unmet.minVersion} or newer - this site is on v${currentVersion}. Update "${depName}" first, then update "${displayName}".`
              : `The new version of "${displayName}" needs the "${depName}" module (v${unmet.minVersion} or newer) installed and active. Sort that out first, then update "${displayName}".`,
            code: 'module_version_required',
            moduleName: displayName,
            dependencyName: depName,
            requiredVersion: unmet.minVersion,
            currentVersion,
          },
          { status: 409 }
        )
      }
    }

    if (!await acquireDeployLock(`module:${mod.name}`)) return errorResponse(LOCK_RACE_MESSAGE, 409)

    try {
      // Commit modules.json and redeploy immediately: the git push auto-deploys and the
      // admin sees live deploy status in the shell. The module ships as 'deploying' with the
      // new tag held in pendingVersion - the confirmed `version` only moves once the deploy
      // succeeds (markModulesDeploySucceeded), so a failed deploy doesn't masquerade as done.
      // Refresh the stored manifest to the one at the tag being installed.
      // Without this the row keeps the manifest recorded at INSTALL time, so a
      // module that declares a new requiredEnvVars entry in a later version can
      // never have that variable managed - /api/admin/env derives its allowed
      // keys from these stored manifests and silently drops anything else, which
      // reads to the admin as "saved" while nothing was written. Written at
      // update time rather than on deploy success on purpose: the env vars have
      // to be settable while the new code is going out, not after.
      await prisma.module.update({
        where: { id },
        data: {
          status: 'deploying',
          pendingVersion: release.tag,
          updateAvailable: null,
          updateNotes: null,
          deployId: 'pending',
          ...(incoming ? { manifest: incoming as object } : {}),
        },
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
            deployId: null,
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
  // The same "bring everything else along" checkboxes the install dialog offers, for
  // the same reason: removing a module costs a deployment either way, so anything
  // ticked here rides out in the SAME commit rather than making the owner sit through
  // a second and third build afterwards.
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

export async function DELETE(request: NextRequest, { params }: Params) {
  // The 60s ceiling starts here: bundling updates in spends extra GitHub round trips
  // before anything is pushed, so the work budget has to be measured from the top of
  // the handler rather than from where the core sync begins.
  const routeStartedAt = Date.now()

  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'modules.manage')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const mod = await prisma.module.findUnique({ where: { id } })
  if (!mod) return errorResponse('Module not found', 404)

  // Block uninstalling a module that another active module still depends on.
  const others = await prisma.module.findMany({
    where: { name: { not: mod.name }, status: 'active' },
    select: { name: true, manifest: true },
  })
  const dependents = others.filter((other) => {
    const otherManifest = other.manifest as { requiresModules?: { name: string }[] } | null
    return otherManifest?.requiresModules?.some((dep) => dep.name === mod.name)
  })
  if (dependents.length > 0) {
    return errorResponse(
      `Cannot remove "${mod.name}" - it is required by: ${dependents.map((d) => d.name).join(', ')}. Remove those first.`
    )
  }

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
  const updateCore = parsed.data.updateCore ?? false
  const updateModules = parsed.data.updateModules ?? false

  const lock = await getActiveDeployLock()
  if (lock) return errorResponse(lockBusyMessage(lock), 409)

  // Uninstall pushes a modules.json commit of its own, so it stacks builds the
  // same way an update does.
  const inFlight = await getDeployInFlight()
  if (inFlight) return errorResponse(deployInFlightMessage(inFlight), 409)

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

  // What else this uninstall's deployment gets to carry. Ticking "update Cactus too"
  // moves the version everything below is judged against to the one this deploy is
  // MOVING TO: core files and modules.json land in one commit, so a module update that
  // needs the incoming core is satisfied by the very build that carries it. Same
  // reasoning as the install route's version of this, and the core route's in reverse.
  let coreTarget: { currentVersion: string; latestVersion: string } | null = null
  if (updateCore) {
    // Updating Cactus itself is a config.manage job. Without this check, modules.manage
    // alone would be enough to push a core update through the uninstall button.
    if (!await hasPermission(user, 'config.manage')) {
      return errorResponse(
        'Updating Cactus needs the settings permission. Remove the module on its own, or ask an administrator to update Cactus.',
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
    // remove the module on its own rather than failing over a checkbox.
  }
  const effectiveCoreVersion = coreTarget?.latestVersion ?? pkg.version

  // Give the bundled work a budget that ends a little before this function's 60s
  // ceiling, net of what the checks above already spent. A GitHub slow spell then
  // produces a real message and a released lock rather than a hard kill.
  const deadlineAt = deadlineFromNow(ROUTE_WORK_BUDGET_MS - (Date.now() - routeStartedAt))

  // Which of the OTHER modules' pending updates can ride along in this uninstall's
  // build. The module being removed is left out of the candidates AND out of the
  // installed set the batch is judged against: it is disappearing in this very commit,
  // so a sibling whose new version has come to require it must be held back rather
  // than pinned into a build that no longer contains it.
  let acceptedUpdates: UpdateCandidate<PendingModuleRow>[] = []
  const skippedUpdates: string[] = []
  if (updateModules) {
    // Nothing has been dropped or deleted yet, so a GitHub failure (or the deadline
    // running out) here is a clean "try again", not a half-done uninstall.
    try {
      const surviving = (await prisma.module.findMany({
        select: { name: true, version: true, status: true },
      })).filter((m) => m.name !== mod.name)
      const pendingRows = await prisma.module.findMany({
        where: { status: 'update_available', name: { not: mod.name } },
        select: { id: true, name: true, repoUrl: true, updateAvailable: true, updateNotes: true, updateChannel: true },
      })
      const candidates: UpdateCandidate<PendingModuleRow>[] = []
      for (const pending of pendingRows) {
        assertWithinDeadline(deadlineAt, 'checking the other modules for updates')
        const pendingRelease = await getLatestRelease(pending.repoUrl, pending.updateChannel as 'public' | 'beta')
        if (!pendingRelease) {
          skippedUpdates.push(`${formatModuleDisplayName(pending.repoUrl)}: no release found`)
          continue
        }
        candidates.push({
          module: pending,
          name: pending.name,
          tag: pendingRelease.tag,
          // Read AT the tag being pinned, not HEAD, so the requirements judged are the
          // ones that version actually ships with.
          requirements: await fetchModuleRequirements(pending.repoUrl, pendingRelease.tag),
        })
      }
      // Same compat gate as "Update all": an incoming version needing a newer core or
      // sibling must never reach modules.json, or it takes this uninstall's build down
      // with it.
      const { accepted, blocked } = resolveUpdateBatch({
        candidates,
        coreVersion: effectiveCoreVersion,
        installed: surviving,
      })
      acceptedUpdates = accepted
      for (const b of blocked) {
        skippedUpdates.push(`${formatModuleDisplayName(b.candidate.module.repoUrl)}: ${b.reason}`)
      }
    } catch (err: unknown) {
      return errorResponse(
        isDeadlineError(err)
          ? (err as Error).message
          : `Couldn't check the other modules for updates: ${err instanceof Error ? err.message : 'Unknown error'}. Nothing was changed - try again, or remove the module without updating the others.`,
        503
      )
    }
  }

  if (!await acquireDeployLock(`module:uninstall:${mod.name}`)) return errorResponse(LOCK_RACE_MESSAGE, 409)

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
      // Data teardown dropped the module's tables, so its migration history
      // must go too - otherwise a reinstall skips the migrations and the
      // tables never come back.
      ...(mode === 'code_and_data'
        ? [prisma.moduleMigration.deleteMany({ where: { moduleName: mod.name } })]
        : []),
    ])

    // Queue the accepted sibling updates into the SAME build this uninstall triggers.
    // Reconciled to 'active' by the redeploying-screen poll / webhook once the deploy
    // lands (lib/deploy/reconcile.ts), exactly as a solo module update is.
    for (const c of acceptedUpdates) {
      await prisma.module.update({
        where: { id: c.module.id },
        data: { status: 'deploying', pendingVersion: c.tag, updateAvailable: null, updateNotes: null, deployId: 'pending' },
      })
    }

    // With a core update bundled in, the core sync is what does the committing: it
    // pushes the core files AND modules.json in one commit, so it has to carry every
    // remaining module's pin - the row for the module being removed is already gone
    // above, which is exactly how it drops out of the registry. startDeferredRedeploy
    // is then told to adopt that push's build rather than committing a second time.
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

    // The module's layouts are core Layout rows, so the teardown above never touched
    // them - it only drops the module's own tables. Left behind, they clutter the
    // Layouts list with pages nothing can render any more. The prune reads the mode
    // for itself: code_only keeps the ModuleMigration history (so a reinstall picks
    // the data back up) and its layouts are kept with it; code_and_data cleared both.
    try {
      await pruneUninstalledModuleLayouts(prisma)
    } catch (err) {
      console.error('[modules] Failed to prune layouts for uninstalled module:', err)
    }

    // Module is gone - clear any lingering "update available" reminder for it.
    try {
      await clearAlert(`module-update:${id}`)
    } catch (err) {
      console.error('[modules] Failed to clear module-update notification:', err)
    }

    // Deleting the row above removes it from the desired registry. Commit modules.json
    // and redeploy immediately; the admin sees live deploy status in the shell. With a
    // core update bundled in, that commit has already happened - adopt its build.
    const { triggered } = await startDeferredRedeploy(
      committedSince !== undefined ? { committedSince } : {}
    )
    if (!triggered) {
      // No Vercel creds: fall back to the deferred-notification flow, promoting the
      // queued updates optimistically (same as the "Update all" path) so they aren't
      // stranded in 'deploying' with no deploy left to reconcile them.
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
      await recordDeploymentNeeded({ label: `Module '${mod.name}' uninstalled` })
      return NextResponse.json({
        ok: true,
        droppedTables,
        coreUpdatedTo: coreTarget?.latestVersion ?? null,
        moduleUpdatesQueued: acceptedUpdates.length,
        moduleUpdatesSkipped: skippedUpdates,
      })
    }
  } catch (err: unknown) {
    // The module's own removal is already committed to the database by this point and
    // cannot be undone, but the sibling rows can: put them back where they were, or
    // they sit in 'deploying' with no deploy coming.
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
    await prisma.deployLock.deleteMany({ where: { id: 'singleton' } })

    // Ask GitHub whether GitHub is the problem, same as the install and core-update
    // routes: a live outage turns "Uninstall failed: 502" into something the owner can
    // act on (namely: wait).
    const base = err instanceof Error ? err.message : 'Unknown error'
    let note = ''
    try {
      note = await gitHubOutageNote()
    } catch { /* status page unreachable: report the raw failure alone */ }

    return errorResponse(
      note ? `Uninstall failed: ${base} ${note}` : `Uninstall failed: ${base}`,
      isDeadlineError(err) || note ? 503 : 500
    )
  }

  return NextResponse.json({
    ok: true,
    droppedTables,
    redeployTriggered: true,
    coreUpdatedTo: coreTarget?.latestVersion ?? null,
    moduleUpdatesQueued: acceptedUpdates.length,
    moduleUpdatesSkipped: skippedUpdates,
  })
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
  if (!release || compareVersions(release.tag, mod.version) <= 0) {
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
