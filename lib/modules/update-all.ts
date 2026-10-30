import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { errorResponse } from '@/lib/utils'
import { formatModuleDisplayName } from '@/lib/modules/manifest'
import { fetchModuleRequirements, resolveUpdateBatch, type UpdateCandidate } from '@/lib/modules/compat'
import { getLatestRelease } from '@/lib/modules/github'
import { getGitHubConfigStatus, isLocalMode } from '@/lib/config/env'
import { recordDeploymentNeeded } from '@/lib/notifications/deployment'
import { clearAlert } from '@/lib/notifications/alerts'
import { startDeferredRedeploy } from '@/lib/deploy/redeploy'
import { getActiveDeployLock, acquireDeployLock, lockBusyMessage, LOCK_RACE_MESSAGE } from '@/lib/deploy/lock'
import { getDeployInFlight, deployInFlightMessage } from '@/lib/deploy/in-flight'
import { settleFinishedDeploy } from '@/lib/deploy/reconcile'
import pkg from '@/package.json'

// Updates every module flagged update_available in one build. The caller has already
// decided who may: the Modules page's "Update all" (PATCH /api/admin/modules) and the
// server the site runs on (POST /api/internal/host-update).
export async function applyModuleUpdateAll(): Promise<Response> {
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
    select: { name: true, version: true, status: true, pendingVersion: true },
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

  const { triggered, manualDeployRequired } = await startDeferredRedeploy()
  if (manualDeployRequired) {
    return NextResponse.json({ ok: true, updated: updated.length, failed, status: 'deploying', redeployTriggered: false, manualDeployRequired: true })
  }
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
