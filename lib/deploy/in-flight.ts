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

type ProductionDeployment = { uid: string; created: number; readyState?: string }

async function newestProductionDeployment(): Promise<ProductionDeployment | null> {
  const token = process.env.VERCEL_API_TOKEN
  const projectId = process.env.VERCEL_PROJECT_ID
  if (!token || !projectId) return null

  try {
    const res = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}&target=production&limit=1`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) }
    )
    if (!res.ok) return null
    const data = (await res.json()) as { deployments?: ProductionDeployment[] }
    return data.deployments?.[0] ?? null
  } catch {
    // An API that will not answer must not lock the owner out of their own admin.
    return null
  }
}

function isRunning(state: string | undefined): boolean {
  return state === 'BUILDING' || state === 'QUEUED' || state === 'INITIALIZING'
}

async function newestProductionBuildRunning(): Promise<boolean> {
  return isRunning((await newestProductionDeployment())?.readyState)
}

// The deployment status a RECONCILE decision may act on - promoting a module's
// pendingVersion, or rolling it back. Stricter than getLatestDeploymentStatus,
// and it has to be.
//
// getLatestDeploymentStatus answers about "the newest deployment on this project"
// when handed no id or the 'pending' sentinel. As a display fallback that is the
// best available answer; as the basis for a reconcile it is a trap, because the
// newest deployment during that window is the PREVIOUS one, and it is READY.
//
// Watched happen on 2026-08-26. startDeferredRedeploy writes the sentinel
// synchronously and only learns the real deployment id from a poll seconds later.
// A Modules-page status check landing inside that gap read READY off the build
// before ours and promoted reviews-for-shop to v0.1.12 while the build carrying
// v0.1.12 still had 80 seconds to run. It succeeded, so the row happened to end up
// true - had it failed, the database would have claimed a version the site was not
// running, and lastFailedVersion would never have been set to rescue the pin.
//
// So: a specific id is answered about specifically. Without one, a deployment that
// STARTED BEFORE we pushed can never be the answer, and we say UNKNOWN instead -
// which every caller already treats as "leave it deploying and ask again later".
export async function deploymentStatusForReconcile(args: {
  trackedId?: string | null
  since?: Date | null
}): Promise<'READY' | 'ERROR' | 'BUILDING' | 'UNKNOWN'> {
  if (args.trackedId && args.trackedId !== 'pending') {
    return getLatestDeploymentStatus(args.trackedId)
  }

  const newest = await newestProductionDeployment()
  if (!newest) return 'UNKNOWN'
  if (args.since && newest.created <= args.since.getTime()) return 'UNKNOWN'

  if (isRunning(newest.readyState)) return 'BUILDING'
  if (newest.readyState === 'READY') return 'READY'
  if (newest.readyState === 'ERROR' || newest.readyState === 'CANCELED') return 'ERROR'
  return 'UNKNOWN'
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
