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
import {
  getServerBuild,
  getServerSite,
  listServerBuilds,
  serverStateToNormalised,
  startServerBuild,
} from '@/lib/server-host/deploy'

// Builds on the site's hosting platform, whichever it is. Every state is normalised
// to READY / ERROR / CANCELED / BUILDING / UNKNOWN so the reconcile, in-flight and
// status code above never has to know which platform answered.
//
// Each function switches on the provider explicitly, with no "else it must be the
// other one": adding a provider is then a type error everywhere it has not been
// handled, rather than a quiet fall-through into somebody else's API.

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

function errorResult(err: unknown): RedeployResult {
  return { triggered: false, error: err instanceof Error ? err.message : 'Unknown error' }
}

async function startServerBuildResult(
  creds: HostingCredentials,
  sha?: string
): Promise<RedeployResult & { alreadyRunning?: boolean }> {
  try {
    const { build, alreadyRunning } = await startServerBuild(creds.token, creds.siteId, { sha })
    return { triggered: true, deploymentId: build.id, alreadyRunning }
  } catch (err: unknown) {
    return errorResult(err)
  }
}

/**
 * Rebuilds the site as it stands now - current branch HEAD, current env vars. Never a
 * rollback. The caller MUST surface `error` when `triggered` is false.
 */
export async function triggerRedeploy(creds: HostingCredentials): Promise<RedeployResult> {
  switch (creds.provider) {
    case 'vercel':
      return triggerVercelRedeploy(creds.token, creds.siteId)
    case 'netlify':
      if (isLocalMode()) return localModeResult()
      try {
        const deploymentId = await triggerNetlifyBuild(creds.token, creds.siteId)
        return { triggered: true, deploymentId }
      } catch (err: unknown) {
        return errorResult(err)
      }
    case 'server':
      if (isLocalMode()) return localModeResult()
      return startServerBuildResult(creds)
  }
}

/**
 * Whether a commit pushed to the site's repo can become a build on the host. Always
 * true on Netlify, which builds from Git or not at all, and on a server, where
 * cactus-host fetches the commit itself. On Vercel, false only for a project with no
 * Git link (deployed by `vercel deploy` uploads). Fails open.
 */
export async function canBuildCommits(creds: HostingCredentials): Promise<boolean> {
  switch (creds.provider) {
    case 'vercel':
      return vercelProjectHasGitLink(creds.token, creds.siteId)
    case 'netlify':
    case 'server':
      return true
  }
}

/**
 * Whether a push to the site's repo starts a build on its own. Vercel and Netlify
 * watch the repository; nothing on a server does (no webhook, and polling GitHub
 * would spend the API budget), so there the caller starts the build itself, straight
 * away, instead of waiting to adopt one that is never coming.
 */
export function pushStartsBuild(provider: HostingCredentials['provider']): boolean {
  switch (provider) {
    case 'vercel':
    case 'netlify':
      return true
    case 'server':
      return false
  }
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
  switch (creds.provider) {
    case 'vercel':
      return ensureVercelRedeploy(creds.token, creds.siteId, opts)
    case 'netlify': {
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
    case 'server':
      // cactus-host does the adopting itself: one build per site, and a second start
      // while one runs hands back the running one with alreadyRunning set. Always
      // the branch head, so requireLatestCommit is met by construction.
      if (isLocalMode()) return localModeResult()
      return startServerBuildResult(creds)
  }
}

/** Newest deployments first, or null when the platform will not answer. */
export async function listDeployments(
  creds: HostingCredentials,
  opts: { productionOnly?: boolean; limit?: number } = {}
): Promise<HostDeployment[] | null> {
  switch (creds.provider) {
    case 'vercel': {
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
    case 'netlify':
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
    case 'server':
      // Every build on a server is a production build: there are no previews.
      try {
        const list = await listServerBuilds(creds.token, creds.siteId, { limit: opts.limit })
        return list.map((b) => ({ id: b.id, createdAt: b.createdAt, state: serverStateToNormalised(b.state) }))
      } catch {
        return null
      }
  }
}

/** One deployment's state, or null when the id is unknown or the platform will not answer. */
export async function getDeploymentState(
  creds: HostingCredentials,
  deploymentId: string
): Promise<NormalisedDeployState | null> {
  switch (creds.provider) {
    case 'vercel': {
      const state = await getVercelDeploymentState(creds.token, deploymentId)
      return state === null ? null : vercelStateToNormalised(state)
    }
    case 'netlify':
      try {
        const deploy = await getNetlifyDeploy(creds.token, deploymentId)
        return deploy ? netlifyStateToNormalised(deploy.state) : null
      } catch {
        return null
      }
    case 'server':
      try {
        const build = await getServerBuild(creds.token, creds.siteId, deploymentId)
        return build ? serverStateToNormalised(build.state) : null
      } catch {
        return null
      }
  }
}

/** The project's (Vercel) or site's (Netlify, server) human-readable name. */
export async function getHostSiteName(creds: HostingCredentials): Promise<string | null> {
  switch (creds.provider) {
    case 'vercel':
      return getVercelProjectName(creds.token, creds.siteId)
    case 'netlify':
      return (await getNetlifySite(creds.token, creds.siteId))?.name ?? null
    case 'server':
      return (await getServerSite(creds.token, creds.siteId))?.name ?? null
  }
}

/** "Trigger a redeploy from the Vercel dashboard", for whichever platform. */
export function hostDashboardRedeployHint(provider: HostingCredentials['provider']): string {
  switch (provider) {
    case 'vercel':
      return 'Trigger a redeploy from the Vercel dashboard (Deployments → ⋯ → Redeploy)'
    case 'netlify':
      return 'Trigger a deploy from the Netlify dashboard (Deploys → Trigger deploy → Deploy site)'
    case 'server':
      return 'Start a build on your server (cactus-host build <site>, as root)'
  }
}

export function hostLabel(provider: HostingCredentials['provider']): string {
  return HOSTING_PROVIDER_LABELS[provider]
}
