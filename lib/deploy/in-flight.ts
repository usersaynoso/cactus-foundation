import { prisma } from '@/lib/db/prisma'
import { getLatestDeploymentStatus } from '@/lib/modules/github'

// Is a build the site started still running?
//
// The deploy lock next door is NOT this. It spans the request that starts an
// update and is released before the Vercel build that update triggers has even
// begun, so it guards roughly a second of a process that takes minutes. That
// left the entire build window open, and clicking Update again inside it does
// real damage:
//
//   - two commits, two builds, stacked on one another;
//   - SiteConfig.pendingRedeployId overwritten by the second, orphaning the
//     first, so the admin tracks the wrong build;
//   - and worst, markModulesDeploySucceeded() promotes EVERY module sitting in
//     'deploying' the moment ANY build lands. A module queued for the second
//     commit is recorded as installed off the back of the first build, whose
//     code never contained it. The row says live, the site is running something
//     else, and nothing ever notices.
//
// So the gate has to be the build, not the request.
//
// Fails open throughout. A site with no Vercel credentials never deploys this
// way in the first place, and an API that won't answer must not lock the owner
// out of their own admin.

// How long the 'pending' sentinel is believed on its own. startDeferredRedeploy
// writes it synchronously and pushes the commit afterwards in an after()
// callback, so for a few seconds there is genuinely nothing to ask Vercel about.
// Past this we ask anyway - a run that died between writing the sentinel and
// pushing must not gate anything for ever.
export const SENTINEL_TRUST_MS = 2 * 60_000

export type DeployInFlight = {
  deploymentId: string
  startedAt: Date | null
}

export async function getDeployInFlight(): Promise<DeployInFlight | null> {
  const cfg = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { pendingRedeployId: true, pendingRedeployAt: true },
  })
  const pendingId = cfg?.pendingRedeployId ?? null
  const startedAt = cfg?.pendingRedeployAt ?? null

  if (pendingId === 'pending') {
    const age = startedAt ? Date.now() - startedAt.getTime() : Infinity
    if (age < SENTINEL_TRUST_MS) return { deploymentId: pendingId, startedAt }
  }

  // Ask about the build we armed, where we know which one it was.
  if (pendingId && pendingId !== 'pending') {
    const state = await getLatestDeploymentStatus(pendingId)
    return state === 'BUILDING' ? { deploymentId: pendingId, startedAt } : null
  }

  // Otherwise ask whether the project has a production build running. This half
  // is load-bearing: pendingRedeployId is cleared after REDEPLOY_MAX_MS (4
  // minutes) by the admin's own status poller, which is shorter than a slow
  // build takes, so the row falling quiet is not evidence the build has
  // finished.
  //
  // Scoped to target=production deliberately. The generic newest-deployment
  // lookup in getLatestDeploymentStatus counts previews too, and a preview build
  // is not something an install or update can collide with - blocking the admin
  // on one would be a gate that fires for no reason.
  return (await newestProductionBuildRunning()) ? { deploymentId: 'latest', startedAt } : null
}

async function newestProductionBuildRunning(): Promise<boolean> {
  const token = process.env.VERCEL_API_TOKEN
  const projectId = process.env.VERCEL_PROJECT_ID
  if (!token || !projectId) return false

  try {
    const res = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}&target=production&limit=1`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) }
    )
    if (!res.ok) return false
    const data = (await res.json()) as { deployments?: Array<{ readyState?: string }> }
    const state = data.deployments?.[0]?.readyState
    return state === 'BUILDING' || state === 'QUEUED' || state === 'INITIALIZING'
  } catch {
    // An API that will not answer must not lock the owner out of their own admin.
    return false
  }
}

// The 409 an install / update gets while a build is still running. Says what to
// wait for, because "in progress" with nothing to watch reads as "try again and
// hope".
export function deployInFlightMessage(deploy: DeployInFlight): string {
  const startedAt = deploy.startedAt
  const mins = startedAt ? Math.floor((Date.now() - startedAt.getTime()) / 60_000) : 0
  const since = mins >= 1 ? ` It started ${mins} minute${mins === 1 ? '' : 's'} ago.` : ''
  return `A deployment is already running, and starting another one now would leave both half-applied. Wait for it to go live, then update again.${since}`
}
