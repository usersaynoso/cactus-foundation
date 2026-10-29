import { prisma } from '@/lib/db/prisma'
import { getHostingCredentials } from '@/lib/hosting/provider'
import { listDeployments, type HostDeployment } from '@/lib/hosting/deploy'
import { recordDeploymentNeeded } from '@/lib/notifications/deployment'
import { MANUAL_DEPLOY_MESSAGE } from '@/lib/deploy/manual-message'

export { MANUAL_DEPLOY_MESSAGE }

// A commit Cactus pushed that the host cannot build: a Vercel project with no Git
// link, deployed by uploading files with the Vercel CLI. Nothing watches the repo,
// and a redeploy only replays the previous upload, so the owner has to deploy it.
//
// The modules riding that commit stay 'deploying' on their old confirmed version,
// with deployId set to `manual:<epoch ms of the commit>` instead of a deployment id.
// The Modules page's check-status promotes them once a production deployment newer
// than the commit goes READY - one the owner made, not a replay of an older upload.

// The notification bell's line for it. One label, so repeat commits collapse into one entry.
export const MANUAL_DEPLOY_LABEL = 'Committed to GitHub - deploy the site yourself'

const PREFIX = 'manual:'

export function manualDeployMarker(committedAt: number): string {
  return `${PREFIX}${committedAt}`
}

/** The commit time a manual-deploy marker carries, or null for any other deployId. */
export function manualDeploySince(deployId: string | null | undefined): number | null {
  if (!deployId?.startsWith(PREFIX)) return null
  const ms = Number(deployId.slice(PREFIX.length))
  return Number.isFinite(ms) ? ms : null
}

// The deployment that settles a manual wait: the newest production deployment made
// after the commit, ignoring replays (a replay rebuilds an older upload's files, so
// it cannot carry the commit). Deliberately IO-free so it is testable.
export function pickManualDeploy(newestFirst: HostDeployment[], since: number): HostDeployment | null {
  return newestFirst.find((d) => d.createdAt > since && !d.isReplay) ?? null
}

/** READY / ERROR / BUILDING for the deployment that settles the wait, UNKNOWN while there is none. */
export async function manualDeployStatus(since: number): Promise<'READY' | 'ERROR' | 'BUILDING' | 'UNKNOWN'> {
  const creds = getHostingCredentials()
  if (!creds) return 'UNKNOWN'
  const list = await listDeployments(creds, { productionOnly: true, limit: 10 })
  const hit = list ? pickManualDeploy(list, since) : null
  if (!hit) return 'UNKNOWN'
  if (hit.state === 'CANCELED') return 'ERROR'
  return hit.state === 'UNKNOWN' ? 'UNKNOWN' : hit.state
}

// Re-tags the modules queued for the build that is not coming, and puts a line in the
// notification bell. Called by startDeferredRedeploy instead of arming the gate.
export async function markAwaitingManualDeploy(committedAt: number): Promise<void> {
  try {
    await prisma.module.updateMany({
      where: { status: 'deploying', deployId: 'pending' },
      data: { deployId: manualDeployMarker(committedAt) },
    })
  } catch (err) {
    console.error('[redeploy] Failed to mark modules as awaiting a manual deploy:', err)
  }
  try {
    await recordDeploymentNeeded({ label: MANUAL_DEPLOY_LABEL, detail: MANUAL_DEPLOY_MESSAGE })
  } catch (err) {
    console.error('[redeploy] Failed to record the manual-deploy notification:', err)
  }
}
