import { isLocalMode } from '@/lib/config/env'
import type { HostingCredentials } from './provider'
import { HOSTING_PROVIDER_LABELS } from './provider'
import {
  ensureVercelRedeploy,
  getVercelDeploymentState,
  getVercelProjectName,
  listVercelDeployments,
  triggerVercelRedeploy,
  vercelProjectHasGitLink,
  type RedeployResult,
} from '@/lib/vercel/deploy'
import {
  getNetlifyDeploy,
  listNetlifyDeploys,
  netlifyStateToNormalised,
  triggerNetlifyBuild,
  type NormalisedDeployState,
} from '@/lib/netlify/deploy'
import { getNetlifySite } from '@/lib/netlify/api'

// Builds on the site's hosting platform, whichever it is. Every state is normalised
// to READY / ERROR / CANCELED / BUILDING / UNKNOWN so the reconcile, in-flight and
// status code above never has to know which platform answered.

export type { RedeployResult, NormalisedDeployState }

export type HostDeployment = {
  id: string
  /** Epoch ms the deployment was created. */
  createdAt: number
  state: NormalisedDeployState
  /** Vercel only: true when this is a replay of an earlier deployment's files. */
  isReplay?: boolean
}

export function vercelStateToNormalised(state: string | undefined | null): NormalisedDeployState {
  if (state === 'READY') return 'READY'
  if (state === 'ERROR') return 'ERROR'
  if (state === 'CANCELED') return 'CANCELED'
  if (state === 'BUILDING' || state === 'QUEUED' || state === 'INITIALIZING') return 'BUILDING'
  return 'UNKNOWN'
}

function localModeResult(): RedeployResult {
  return { triggered: false, error: 'Redeploys are not available in local-development mode' }
}

/**
 * Rebuilds the site as it stands now - current branch HEAD, current env vars. Never a
 * rollback. The caller MUST surface `error` when `triggered` is false.
 */
export async function triggerRedeploy(creds: HostingCredentials): Promise<RedeployResult> {
  if (creds.provider === 'vercel') return triggerVercelRedeploy(creds.token, creds.siteId)
  if (isLocalMode()) return localModeResult()
  try {
    const deploymentId = await triggerNetlifyBuild(creds.token, creds.siteId)
    return { triggered: true, deploymentId }
  } catch (err: unknown) {
    return { triggered: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Whether a commit pushed to the site's repo can become a build on the host. Always
 * true on Netlify, which builds from Git or not at all. On Vercel, false only for a
 * project with no Git link (deployed by `vercel deploy` uploads). Fails open.
 */
export async function canBuildCommits(creds: HostingCredentials): Promise<boolean> {
  if (creds.provider !== 'vercel') return true
  return vercelProjectHasGitLink(creds.token, creds.siteId)
}

/**
 * Like triggerRedeploy, but adopts a production build that is already running instead
 * of stacking another on top. `requireLatestCommit` refuses (error 'no-git-link')
 * rather than replaying old files on a host that cannot build the commit.
 */
export async function ensureRedeploy(
  creds: HostingCredentials,
  opts: { requireLatestCommit?: boolean } = {}
): Promise<RedeployResult & { alreadyRunning?: boolean }> {
  if (creds.provider === 'vercel') return ensureVercelRedeploy(creds.token, creds.siteId, opts)
  if (isLocalMode()) return localModeResult()
  try {
    const [latest] = await listNetlifyDeploys(creds.token, creds.siteId, { productionOnly: true, limit: 1 })
    if (latest && netlifyStateToNormalised(latest.state) === 'BUILDING') {
      return { triggered: true, deploymentId: latest.id, alreadyRunning: true }
    }
  } catch {
    // Could not list - fall through and start one; a duplicate build is the lesser harm.
  }
  return triggerRedeploy(creds)
}

/** Newest deployments first, or null when the platform will not answer. */
export async function listDeployments(
  creds: HostingCredentials,
  opts: { productionOnly?: boolean; limit?: number } = {}
): Promise<HostDeployment[] | null> {
  if (creds.provider === 'vercel') {
    const list = await listVercelDeployments(creds.token, creds.siteId, opts)
    return (
      list?.map((d) => ({
        id: d.uid,
        createdAt: d.created,
        state: vercelStateToNormalised(d.readyState ?? d.state),
        isReplay: d.source === 'redeploy',
      })) ?? null
    )
  }
  try {
    const list = await listNetlifyDeploys(creds.token, creds.siteId, opts)
    return list.map((d) => ({
      id: d.id,
      createdAt: d.created_at ? Date.parse(d.created_at) : 0,
      state: netlifyStateToNormalised(d.state),
    }))
  } catch {
    return null
  }
}

/** One deployment's state, or null when the id is unknown or the platform will not answer. */
export async function getDeploymentState(
  creds: HostingCredentials,
  deploymentId: string
): Promise<NormalisedDeployState | null> {
  if (creds.provider === 'vercel') {
    const state = await getVercelDeploymentState(creds.token, deploymentId)
    return state === null ? null : vercelStateToNormalised(state)
  }
  try {
    const deploy = await getNetlifyDeploy(creds.token, deploymentId)
    return deploy ? netlifyStateToNormalised(deploy.state) : null
  } catch {
    return null
  }
}

/** The project's (Vercel) or site's (Netlify) human-readable name. */
export async function getHostSiteName(creds: HostingCredentials): Promise<string | null> {
  if (creds.provider === 'vercel') return getVercelProjectName(creds.token, creds.siteId)
  return (await getNetlifySite(creds.token, creds.siteId))?.name ?? null
}

/** "Trigger a redeploy from the Vercel dashboard", for whichever platform. */
export function hostDashboardRedeployHint(provider: HostingCredentials['provider']): string {
  return provider === 'netlify'
    ? 'Trigger a deploy from the Netlify dashboard (Deploys → Trigger deploy → Deploy site)'
    : 'Trigger a redeploy from the Vercel dashboard (Deployments → ⋯ → Redeploy)'
}

export function hostLabel(provider: HostingCredentials['provider']): string {
  return HOSTING_PROVIDER_LABELS[provider]
}
