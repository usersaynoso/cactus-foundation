import { after } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { triggerRedeploy, ensureRedeploy, listDeployments, canBuildCommits } from '@/lib/hosting/deploy'
import { markAwaitingManualDeploy } from '@/lib/deploy/manual'
import { getHostingCredentials, type HostingCredentials } from '@/lib/hosting/provider'
import { syncModulesJson } from '@/lib/modules/github'
import { invalidateSiteConfigCache } from '@/lib/config/site'
import { isLocalMode } from '@/lib/config/env'

// Arms the redeploy gate (pendingRedeployId drives the admin deploy status bar
// and the notification bell's live section while set), then in an after()
// callback ships the current module registry: commit modules.json (the git push triggers a build on the host) and
// capture that build's id, falling back to an explicit env-var redeploy when there's
// nothing to commit. Shared by the module lifecycle routes and the "Redeploy now"
// notification action. Returns { triggered: false } when hosting creds are missing so
// callers can fall back to the deferred-notification path.
//
// Pass `committedSince` when the caller has ALREADY pushed a commit (e.g. a core
// update via syncCoreFromUpstream) that triggered a build on the host. In that mode the
// helper skips the module sync and just arms the gate and adopts the build the
// existing push created, avoiding a double-deploy.
//
// A host that cannot build commits (a Vercel project with no Git link, deployed by
// CLI uploads) gets neither: when a commit has been or would be pushed, nothing is
// armed and the answer is { triggered: false, manualDeployRequired: true }. The
// modules riding that commit are left on their old version, tagged to be promoted
// by the owner's own deploy (lib/deploy/manual.ts). Telling the owner a build is
// running would be a lie: the only thing Cactus can start there is a replay of the
// previous upload, which goes READY on the old code.
export async function startDeferredRedeploy(
  opts: { committedSince?: number } = {}
): Promise<{ triggered: boolean; manualDeployRequired?: boolean }> {
  // Local-development mode has no git-push deploy or hosted redeploy: report
  // not-triggered so callers fall back to the deferred-notification path.
  if (isLocalMode()) {
    return { triggered: false }
  }

  const creds = getHostingCredentials()
  if (!creds) {
    return { triggered: false }
  }

  const deployStartedAt = opts.committedSince ?? Date.now()

  // Asked once, up front, because the answer decides whether there is anything to
  // arm. Git-linked Vercel and Netlify answer true and carry on exactly as before.
  if (!(await canBuildCommits(creds))) {
    if (opts.committedSince !== undefined) {
      await markAwaitingManualDeploy(opts.committedSince)
      return { triggered: false, manualDeployRequired: true }
    }
    // Whether a commit happens is only known once the registry is synced, so on this
    // host the sync runs now rather than in after(). Nothing to commit means an
    // env-var redeploy, which a replay does correctly: fall through to it.
    const committedAt = Date.now()
    if (await syncModuleRegistry()) {
      await markAwaitingManualDeploy(committedAt)
      return { triggered: false, manualDeployRequired: true }
    }
    return armAndRedeploy(creds, deployStartedAt, { registrySynced: true })
  }

  return armAndRedeploy(creds, deployStartedAt, opts)
}

// Deferred module registry sync. The desired state is the set of Module rows whose
// code should actually ship. A row existing is nearly enough - uninstall deletes the
// row - but NOT quite, because 'failed' and 'inactive' are the two states that must
// not run.
//
// Shipping those was a real hole: modules.json drives both the module checkout and
// the build-time generators, so a failed or disabled module still got cloned and
// wired into the router, while scripts/run-module-migrations.mjs only migrates
// status IN ('active','deploying','update_available'). The result is live routes
// sitting on tables that were never created - a 500 on a page the owner believes is
// switched off, or one whose install they watched fail.
//
// Every other status still ships, deliberately: pending_install / pending_deploy /
// deploying are mid-install, and their code has to be present for the very build
// that installs them.
//
// Returns whether a commit was pushed. If this throws, the caller falls through to
// the env-var redeploy path so settings-only redeploys still work.
async function syncModuleRegistry(): Promise<boolean> {
  try {
    const modules = await prisma.module.findMany({
      where: { status: { notIn: ['failed', 'inactive'] } },
    })
    const synced = await syncModulesJson(
      // Ship the in-flight target while a deploy is mid-flight (pendingVersion);
      // it's promoted to `version` only once the deploy succeeds.
      modules.map((m) => ({
        name: m.name,
        repoUrl: m.repoUrl,
        version: m.pendingVersion ?? m.version,
        lastFailedVersion: m.lastFailedVersion,
      }))
    )
    return synced.committed
  } catch (err) {
    console.error('[redeploy] Module registry sync failed, falling back to redeploy:', err)
    return false
  }
}

async function armAndRedeploy(
  creds: HostingCredentials,
  deployStartedAt: number,
  opts: { committedSince?: number; registrySynced?: boolean }
): Promise<{ triggered: boolean }> {
  // Sentinel written synchronously so the admin deploy status surfaces show up
  // immediately; the real deployment id is resolved below via after().
  await prisma.siteConfig.update({
    where: { id: 'singleton' },
    data: { pendingRedeployId: 'pending', pendingRedeployAt: new Date() },
  })
  invalidateSiteConfigCache()

  after(async () => {
    // Persist a resolved deployment id once we have one. When the poll comes up
    // empty we intentionally leave the 'pending' sentinel in place rather than
    // nulling it: nulling hides the deploy status from the admin mid-build.
    // The server-side 2-minute auto-release (resolvePendingRedeploy) is the backstop.
    const persistDeploymentId = async (uid: string | undefined) => {
      if (!uid) return
      try {
        await prisma.siteConfig.updateMany({
          where: { id: 'singleton', pendingRedeployId: 'pending' },
          data: { pendingRedeployId: uid },
        })
        invalidateSiteConfigCache()
      } catch (err) {
        console.error('[redeploy] Failed to persist pendingRedeployId:', err)
      }
      // Same id onto the modules riding this build. The site marker doubles as the
      // admin's live status and self-expires after four minutes, which is shorter
      // than a slow build; the module rows keep theirs until the build is
      // reconciled, so a terminal event can always be matched to the right modules.
      try {
        await prisma.module.updateMany({
          where: { status: 'deploying', deployId: 'pending' },
          data: { deployId: uid },
        })
      } catch (err) {
        console.error('[redeploy] Failed to persist module deployId:', err)
      }
    }

    // Poll the host for the deployment created after we started (used when we don't
    // get an id back directly — e.g. a git-push-triggered build).
    const pollForDeploymentId = async (): Promise<string | undefined> => {
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 5_000))
        const recent = await listDeployments(creds, { limit: 5 })
        const id = recent?.find((d) => d.createdAt > deployStartedAt)?.id
        if (id) return id
      }
      return undefined
    }

    // Adopt the build our git push created, and if it never created one, start it
    // ourselves.
    //
    // A push is *supposed* to build on its own, and normally does, so polling first
    // is what keeps this from double-deploying. But when the push produces no build -
    // a missed webhook, a GitHub delivery that never lands - nothing else in the
    // system ever retries. The commit sits in the repo unbuilt while the admin is
    // told the update landed, the module row is promoted to a version whose code was
    // never deployed, and the site quietly runs the previous build until someone
    // pushes again by chance. That is not hypothetical: it stranded a core update
    // carrying two module bumps, and the only clue was a manifest one version behind.
    //
    // ensureRedeploy rather than triggerRedeploy: if a build did start,
    // just late, this adopts it instead of stacking a second one on top.
    const captureOrTrigger = async () => {
      const pushed = await pollForDeploymentId()
      if (pushed) {
        await persistDeploymentId(pushed)
        return
      }
      console.warn('[redeploy] Push produced no deployment - triggering one explicitly')
      // requireLatestCommit: if the project has lost its Git link since the check up
      // front, refuse rather than replay the previous files and call it shipped.
      const result = await ensureRedeploy(creds, { requireLatestCommit: true })
      if (result.triggered && result.deploymentId) {
        await persistDeploymentId(result.deploymentId)
        return
      }
      console.error('[redeploy] Fallback deploy failed to start:', result.error ?? 'unknown error')
      await persistDeploymentId(await pollForDeploymentId())
    }

    if (opts.committedSince !== undefined) {
      // The caller already pushed a commit (e.g. a core update) that triggered a
      // build on the host. Adopt it - do NOT sync modules.
      await captureOrTrigger()
      return
    }

    // registrySynced: the caller already synced (and found nothing to commit).
    const committed = opts.registrySynced ? false : await syncModuleRegistry()

    if (committed) {
      // The git push should have triggered a build on the host - adopt that one rather
      // than double-deploying, and only start one ourselves if it never appeared.
      await captureOrTrigger()
      return
    }

    // No module changes to commit: rebuild current HEAD to pick up env-var changes.
    const result = await triggerRedeploy(creds)
    if (result.triggered && result.deploymentId) {
      await persistDeploymentId(result.deploymentId)
    } else {
      await persistDeploymentId(await pollForDeploymentId())
    }
  })

  return { triggered: true }
}
