import { assertNetlifyOk, netlifyFetch } from './api'

// Netlify deploys, normalised onto the four states the rest of Cactus reasons about
// (the same ones lib/vercel/deploy.ts produces from Vercel's readyState).

export type NetlifyDeploy = {
  id: string
  state?: string
  context?: string
  created_at?: string
  error_message?: string | null
  branch?: string
}

export type NormalisedDeployState = 'READY' | 'ERROR' | 'CANCELED' | 'BUILDING' | 'UNKNOWN'

// Netlify's own states, from its OpenAPI spec. Anything not terminal is still on its
// way - including 'pending_review', which only appears where a team requires approval
// for deploys and resolves when somebody approves it.
export function netlifyStateToNormalised(state: string | undefined): NormalisedDeployState {
  switch (state) {
    case 'ready':
      return 'READY'
    case 'error':
    case 'rejected':
      return 'ERROR'
    case 'cancelled':
    case 'canceled':
    case 'skipped':
      return 'CANCELED'
    case undefined:
    case '':
      return 'UNKNOWN'
    default:
      return 'BUILDING'
  }
}

/**
 * Starts a production build of the site's linked branch at its current HEAD. Netlify
 * re-reads the site's env vars for every build, so this is also how an env change
 * reaches the running site. Returns the id of the deploy the build will produce.
 */
export async function triggerNetlifyBuild(token: string, siteId: string): Promise<string | undefined> {
  const res = await netlifyFetch(token, `/sites/${encodeURIComponent(siteId)}/builds`, {
    method: 'POST',
    body: {},
    timeoutMs: 20_000,
  })
  await assertNetlifyOk(res, 'start a build')
  const data = (await res.json()) as { deploy_id?: string; id?: string }
  return data.deploy_id ?? undefined
}

export async function listNetlifyDeploys(
  token: string,
  siteId: string,
  opts: { productionOnly?: boolean; limit?: number } = {}
): Promise<NetlifyDeploy[]> {
  const params = new URLSearchParams({ per_page: String(opts.limit ?? 5) })
  if (opts.productionOnly) params.set('production', 'true')
  const res = await netlifyFetch(token, `/sites/${encodeURIComponent(siteId)}/deploys?${params}`, {
    timeoutMs: 10_000,
  })
  await assertNetlifyOk(res, 'list deploys')
  return (await res.json()) as NetlifyDeploy[]
}

export async function getNetlifyDeploy(token: string, deployId: string): Promise<NetlifyDeploy | null> {
  const res = await netlifyFetch(token, `/deploys/${encodeURIComponent(deployId)}`, { timeoutMs: 10_000 })
  if (!res.ok) return null
  return (await res.json()) as NetlifyDeploy
}
