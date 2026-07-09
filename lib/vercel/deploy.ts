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
export async function ensureVercelRedeploy(
  token: string,
  projectId: string
): Promise<RedeployResult & { alreadyRunning?: boolean }> {
  if (isLocalMode()) {
    return { triggered: false, error: 'Redeploys are not available in local-development mode' }
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
