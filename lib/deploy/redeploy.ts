import { after } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { triggerVercelRedeploy, ensureVercelRedeploy } from '@/lib/vercel/deploy'
import { syncModulesJson } from '@/lib/modules/github'
import { invalidateSiteConfigCache } from '@/lib/config/site'
import { isLocalMode } from '@/lib/config/env'

// Arms the redeploy gate (pendingRedeployId drives the admin deploy status bar
// and the notification bell's live section while set), then in an after()
// callback ships the current module registry: commit modules.json (the git push triggers a Vercel build) and
// capture that build's id, falling back to an explicit env-var redeploy when there's
// nothing to commit. Shared by the module lifecycle routes and the "Redeploy now"
// notification action. Returns { triggered: false } when Vercel creds are missing so
// callers can fall back to the deferred-notification path.
//
// Pass `committedSince` when the caller has ALREADY pushed a commit (e.g. a core
// update via syncCoreFromUpstream) that triggered a Vercel build. In that mode the
// helper skips the module sync and just arms the gate and adopts the build the
// existing push created, avoiding a double-deploy.
export async function startDeferredRedeploy(
  opts: { committedSince?: number } = {}
): Promise<{ triggered: boolean }> {
  // Local-development mode has no git-push deploy or Vercel redeploy: report
  // not-triggered so callers fall back to the deferred-notification path.
  if (isLocalMode()) {
    return { triggered: false }
  }

  const token = process.env.VERCEL_API_TOKEN
  const projectId = process.env.VERCEL_PROJECT_ID
  if (!token || !projectId) {
    return { triggered: false }
  }

  const deployStartedAt = opts.committedSince ?? Date.now()

  // Sentinel written synchronously so the admin deploy status surfaces show up
  // immediately; the real Vercel deployment id is resolved below via after().
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
    }

    // Poll Vercel for the deployment created after we started (used when we don't
    // get an id back directly — e.g. a git-push-triggered build).
    const pollForDeploymentId = async (): Promise<string | undefined> => {
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 5_000))
        try {
          const res = await fetch(
            `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=5`,
            { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8_000) }
          )
          if (res.ok) {
            const data = (await res.json()) as { deployments?: Array<{ uid: string; created: number }> }
            const uid = data.deployments?.find((d) => d.created > deployStartedAt)?.uid
            if (uid) return uid
          }
        } catch { /* ignore */ }
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
    // ensureVercelRedeploy rather than triggerVercelRedeploy: if a build did start,
    // just late, this adopts it instead of stacking a second one on top.
    const captureOrTrigger = async () => {
      const pushed = await pollForDeploymentId()
      if (pushed) {
        await persistDeploymentId(pushed)
        return
      }
      console.warn('[redeploy] Push produced no deployment - triggering one explicitly')
      const result = await ensureVercelRedeploy(token, projectId)
      if (result.triggered && result.deploymentId) {
        await persistDeploymentId(result.deploymentId)
        return
      }
      console.error('[redeploy] Fallback deploy failed to start:', result.error ?? 'unknown error')
      await persistDeploymentId(await pollForDeploymentId())
    }

    if (opts.committedSince !== undefined) {
      // The caller already pushed a commit (e.g. a core update) that triggered a
      // Vercel build. Adopt it - do NOT sync modules.
      await captureOrTrigger()
      return
    }

    // Deferred module registry sync. The desired state is the full set of Module rows
    // (any status — a row existing means its code should ship; uninstall already deleted
    // the row). If creds are missing or this throws, fall through to the env-var redeploy
    // path so settings-only redeploys still work.
    let committed = false
    try {
      const modules = await prisma.module.findMany()
      const synced = await syncModulesJson(
        // Ship the in-flight target while a deploy is mid-flight (pendingVersion);
        // it's promoted to `version` only once the deploy succeeds.
        modules.map((m) => ({ name: m.name, repoUrl: m.repoUrl, version: m.pendingVersion ?? m.version }))
      )
      committed = synced.committed
    } catch (err) {
      console.error('[redeploy] Module registry sync failed, falling back to redeploy:', err)
    }

    if (committed) {
      // The git push should have triggered a Vercel build - adopt that one rather
      // than double-deploying, and only start one ourselves if it never appeared.
      await captureOrTrigger()
      return
    }

    // No module changes to commit: rebuild current HEAD to pick up env-var changes.
    const result = await triggerVercelRedeploy(token, projectId)
    if (result.triggered && result.deploymentId) {
      await persistDeploymentId(result.deploymentId)
    } else {
      await persistDeploymentId(await pollForDeploymentId())
    }
  })

  return { triggered: true }
}
