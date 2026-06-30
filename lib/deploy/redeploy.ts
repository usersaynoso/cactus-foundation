import { after } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { triggerVercelRedeploy } from '@/lib/vercel/deploy'
import { syncModulesJson } from '@/lib/modules/github'
import { invalidateSiteConfigCache } from '@/lib/config/site'

// Opens the redeploy gate (proxy traps admin requests on /cactus-status/redeploying
// while pendingRedeployId is set), then in an after() callback ships the current
// module registry: commit modules.json (the git push triggers a Vercel build) and
// capture that build's id, falling back to an explicit env-var redeploy when there's
// nothing to commit. Shared by the module lifecycle routes and the "Redeploy now"
// notification action. Returns { triggered: false } when Vercel creds are missing so
// callers can fall back to the deferred-notification path.
//
// Pass `committedSince` when the caller has ALREADY pushed a commit (e.g. a core
// update via syncCoreFromUpstream) that triggered a Vercel build. In that mode the
// helper skips the module sync and the triggerVercelRedeploy fallback - it just arms
// the gate and polls for the build the existing push created, avoiding a double-deploy.
export async function startDeferredRedeploy(
  opts: { committedSince?: number } = {}
): Promise<{ triggered: boolean }> {
  const token = process.env.VERCEL_API_TOKEN
  const projectId = process.env.VERCEL_PROJECT_ID
  if (!token || !projectId) {
    return { triggered: false }
  }

  const deployStartedAt = opts.committedSince ?? Date.now()

  // Sentinel written synchronously so the proxy shows the redeploying screen
  // immediately; the real Vercel deployment id is resolved below via after().
  await prisma.siteConfig.update({
    where: { id: 'singleton' },
    data: { pendingRedeployId: 'pending', pendingRedeployAt: new Date() },
  })
  invalidateSiteConfigCache()

  after(async () => {
    // Persist a resolved deployment id once we have one. When the poll comes up
    // empty we intentionally leave the 'pending' sentinel in place rather than
    // nulling it: nulling bounces the admin off the redeploying page mid-build.
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

    if (opts.committedSince !== undefined) {
      // The caller already pushed a commit (e.g. a core update) that triggered a
      // Vercel build. Just capture it - do NOT sync modules or trigger another deploy.
      await persistDeploymentId(await pollForDeploymentId())
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
      // The git push already triggered a Vercel build — do NOT trigger another, or we
      // double-deploy. Just capture the build the push created.
      await persistDeploymentId(await pollForDeploymentId())
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
