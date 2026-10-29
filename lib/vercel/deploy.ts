import { isLocalMode } from '@/lib/config/env'

const VERCEL_API = 'https://api.vercel.com'

export type RedeployResult = { triggered: boolean; deploymentId?: string; error?: string }

// States that mean a deployment is still in flight.
const IN_FLIGHT_STATES = new Set(['QUEUED', 'INITIALIZING', 'BUILDING'])

// Resolves the owning team ID for a project, or null for personal-account projects.
// Vercel's API requires an explicit ?teamId= on deployment endpoints when the
// project belongs to a team — without it, listing and creating deployments fail.
export async function resolveVercelTeamId(token: string, projectId: string): Promise<string | null> {
  try {
    const res = await fetch(`${VERCEL_API}/v9/projects/${encodeURIComponent(projectId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { accountId?: string }
    return data.accountId?.startsWith('team_') ? data.accountId : null
  } catch {
    return null
  }
}

// Fetches a project's human-readable name, for building an identifiable Neon
// project name during DB provisioning. Falls back to null on any failure.
export async function getVercelProjectName(token: string, projectId: string): Promise<string | null> {
  try {
    const res = await fetch(`${VERCEL_API}/v9/projects/${encodeURIComponent(projectId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { name?: string }
    return data.name ?? null
  } catch {
    return null
  }
}

// Whether the project is connected to a Git repository, i.e. whether a commit pushed
// to the site's repo can ever become a build on it. A project deployed by uploading
// files (`vercel deploy --prod`) has `link: null`: nothing watches the repo, and a
// redeploy of its latest deployment replays the previous upload's files, whatever
// `withLatestCommit` says - that flag only means something on a deployment with a
// gitSource. Hobby cannot link an organisation-owned repo, so this is the only free
// way to host one.
//
// Fails OPEN: an API that will not answer reports true, so a Git-linked site is never
// downgraded to "deploy it yourself" by a network blip.
export async function vercelProjectHasGitLink(token: string, projectId: string): Promise<boolean> {
  try {
    const teamId = await resolveVercelTeamId(token, projectId)
    const res = await fetch(
      `${VERCEL_API}/v9/projects/${encodeURIComponent(projectId)}${teamId ? `?teamId=${encodeURIComponent(teamId)}` : ''}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) }
    )
    if (!res.ok) return true
    const data = (await res.json()) as { link?: unknown }
    return data.link !== null
  } catch {
    return true
  }
}

function teamParam(teamId: string | null): string {
  return teamId ? `&teamId=${encodeURIComponent(teamId)}` : ''
}

async function listLatestDeployment(
  token: string,
  projectId: string,
  teamId: string | null
): Promise<{ deployment?: { uid: string; name: string; state: string }; error?: string }> {
  const listRes = await fetch(
    `${VERCEL_API}/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=5&target=production${teamParam(teamId)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    }
  )
  if (!listRes.ok) {
    return { error: `Could not list deployments (${listRes.status})` }
  }
  const listData = (await listRes.json()) as {
    deployments?: Array<{ uid: string; name: string; state: string }>
  }
  const latest = listData.deployments?.[0]
  if (!latest) {
    return { error: 'No existing deployments found to redeploy from' }
  }
  return { deployment: latest }
}

// Triggers a new Vercel production deployment based on the latest existing deployment
// for the project. This picks up any env var changes written since the last deploy.
// Best-effort — if the API call fails, the caller MUST surface the error to the user
// (check `triggered`), otherwise the UI reports a redeploy that never started.
export async function triggerVercelRedeploy(
  token: string,
  projectId: string
): Promise<RedeployResult> {
  // No Vercel control plane in local-development mode - nothing to redeploy.
  if (isLocalMode()) {
    return { triggered: false, error: 'Redeploys are not available in local-development mode' }
  }
  try {
    const teamId = await resolveVercelTeamId(token, projectId)
    const { deployment: latest, error } = await listLatestDeployment(token, projectId, teamId)
    if (!latest) {
      return { triggered: false, error }
    }
    return await createRedeploy(token, latest, teamId)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { triggered: false, error: message }
  }
}

// Like triggerVercelRedeploy, but if a production deployment is already in flight
// it returns that deployment instead of stacking another one on top. Used to
// self-heal the "provisioned, waiting for redeploy" state after a page reload,
// where an earlier trigger may have failed or the deploy may have errored.
//
// `requireLatestCommit` is for callers that need a commit they just pushed to ship.
// On a project with no Git link that cannot happen - a redeploy would rebuild the
// previous upload's files and report READY on the old code - so it answers
// `no-git-link` without starting anything.
export async function ensureVercelRedeploy(
  token: string,
  projectId: string,
  opts: { requireLatestCommit?: boolean } = {}
): Promise<RedeployResult & { alreadyRunning?: boolean }> {
  if (isLocalMode()) {
    return { triggered: false, error: 'Redeploys are not available in local-development mode' }
  }
  if (opts.requireLatestCommit && !(await vercelProjectHasGitLink(token, projectId))) {
    return { triggered: false, error: 'no-git-link' }
  }
  try {
    const teamId = await resolveVercelTeamId(token, projectId)
    const { deployment: latest, error } = await listLatestDeployment(token, projectId, teamId)
    if (!latest) {
      return { triggered: false, error }
    }
    if (IN_FLIGHT_STATES.has(latest.state)) {
      return { triggered: true, deploymentId: latest.uid, alreadyRunning: true }
    }
    return await createRedeploy(token, latest, teamId)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { triggered: false, error: message }
  }
}

// Creates a new deployment based on an existing one. Vercel picks up the
// latest project env vars for the new deployment.
//
// `withLatestCommit` is what makes this a rebuild of the site as it stands rather
// than a rollback. Passing `deploymentId` alone inherits the source deployment's
// gitSource *including its commit sha*, so the build would replay whatever commit
// happened to be last deployed. That is indistinguishable from correct while the
// last deployment is also the newest commit, which is the normal case - and
// silently wrong in the one case that matters, where a push has landed in the repo
// without producing a build. Setting the flag drops the inherited sha so the
// branch's current HEAD is used instead. No caller of this file wants a rollback:
// every one of them means "rebuild the site as it is now, with current settings".
async function createRedeploy(
  token: string,
  source: { uid: string; name: string },
  teamId: string | null
): Promise<RedeployResult> {
  const deployRes = await fetch(`${VERCEL_API}/v13/deployments?forceNew=1${teamParam(teamId)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      deploymentId: source.uid,
      name: source.name,
      target: 'production',
      withLatestCommit: true,
    }),
    signal: AbortSignal.timeout(20_000),
  })

  if (!deployRes.ok) {
    const body = await deployRes.text()
    return { triggered: false, error: `Redeploy API error (${deployRes.status}): ${body}` }
  }

  const deployData = (await deployRes.json()) as { id?: string; uid?: string }
  return { triggered: true, deploymentId: deployData.id ?? deployData.uid }
}

// `source` is how the deployment was made: 'git', 'cli', 'redeploy', 'import' and so on.
export type VercelDeploymentSummary = { uid: string; created: number; readyState?: string; state?: string; source?: string }

// Newest deployments for the project, newest first. `productionOnly` scopes it to
// target=production - previews are not something an install or update can collide
// with. Returns null when the API will not answer, so callers can fail open.
export async function listVercelDeployments(
  token: string,
  projectId: string,
  opts: { productionOnly?: boolean; limit?: number } = {}
): Promise<VercelDeploymentSummary[] | null> {
  const target = opts.productionOnly ? '&target=production' : ''
  try {
    const res = await fetch(
      `${VERCEL_API}/v6/deployments?projectId=${encodeURIComponent(projectId)}${target}&limit=${opts.limit ?? 5}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) }
    )
    if (!res.ok) return null
    const data = (await res.json()) as { deployments?: VercelDeploymentSummary[] }
    return data.deployments ?? []
  } catch {
    return null
  }
}

// One deployment's readyState, or null when the id is unknown (stale, or from
// another project) or the API will not answer.
export async function getVercelDeploymentState(token: string, deploymentId: string): Promise<string | null> {
  try {
    const res = await fetch(`${VERCEL_API}/v13/deployments/${encodeURIComponent(deploymentId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { readyState?: string; status?: string }
    return data.readyState ?? data.status ?? null
  } catch {
    return null
  }
}
