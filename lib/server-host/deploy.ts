import type {
  BuildLogChunk,
  BuildState,
  BuildSummary,
  SiteSummary,
  StartBuildResponse,
} from '@/cactus-host/protocol'
import type { NormalisedDeployState } from '@/lib/netlify/deploy'
import { assertServerHostOk, serverHostFetch, sitePath } from './api'

// Builds on the owner's server, through cactus-host. A build there is the whole of a
// deploy: fetch the commit, install, build, health-check the new release, switch
// traffic to it, and keep the old one for rollback. States are normalised onto the
// same five the Vercel and Netlify twins produce.

export function serverStateToNormalised(state: BuildState | string | undefined | null): NormalisedDeployState {
  switch (state) {
    case 'ready':
      return 'READY'
    case 'error':
      return 'ERROR'
    case 'canceled':
      return 'CANCELED'
    case 'queued':
    case 'building':
      return 'BUILDING'
    default:
      return 'UNKNOWN'
  }
}

export async function getServerSite(token: string, siteId: string): Promise<SiteSummary | null> {
  try {
    const res = await serverHostFetch(token, sitePath(siteId), { timeoutMs: 10_000 })
    if (!res.ok) return null
    return ((await res.json()) as { site?: SiteSummary }).site ?? null
  } catch {
    return null
  }
}

/** Every site the token can see. A cactus-host token belongs to one site, so this is it or nothing. */
export async function listServerSites(token: string): Promise<SiteSummary[]> {
  const res = await serverHostFetch(token, '/sites', { timeoutMs: 10_000 })
  await assertServerHostOk(res, 'list its sites')
  return ((await res.json()) as { sites?: SiteSummary[] }).sites ?? []
}

/**
 * Starts a build. With a sha, exactly that commit; without one, the head of the
 * site's branch as it is now - which is also how an env change reaches the site.
 * cactus-host runs one build per site at a time and hands back the running one
 * (alreadyRunning) rather than queueing a second.
 */
export async function startServerBuild(
  token: string,
  siteId: string,
  opts: { sha?: string } = {}
): Promise<StartBuildResponse> {
  const res = await serverHostFetch(token, sitePath(siteId, '/builds'), {
    method: 'POST',
    body: opts.sha ? { sha: opts.sha } : {},
    timeoutMs: 20_000,
  })
  await assertServerHostOk(res, 'start a build')
  return (await res.json()) as StartBuildResponse
}

export async function listServerBuilds(
  token: string,
  siteId: string,
  opts: { limit?: number } = {}
): Promise<BuildSummary[]> {
  const res = await serverHostFetch(token, sitePath(siteId, `/builds?limit=${opts.limit ?? 5}`), {
    timeoutMs: 10_000,
  })
  await assertServerHostOk(res, 'list builds')
  return ((await res.json()) as { builds?: BuildSummary[] }).builds ?? []
}

export async function getServerBuild(token: string, siteId: string, buildId: string): Promise<BuildSummary | null> {
  const res = await serverHostFetch(token, sitePath(siteId, `/builds/${encodeURIComponent(buildId)}`), {
    timeoutMs: 10_000,
  })
  if (res.status === 404) return null
  await assertServerHostOk(res, 'read a build')
  return ((await res.json()) as { build?: BuildSummary }).build ?? null
}

export async function getServerBuildLog(
  token: string,
  siteId: string,
  buildId: string,
  since: number
): Promise<BuildLogChunk | null> {
  const res = await serverHostFetch(
    token,
    sitePath(siteId, `/builds/${encodeURIComponent(buildId)}/log?since=${Math.max(0, Math.floor(since))}`),
    { timeoutMs: 10_000 }
  )
  if (res.status === 404) return null
  await assertServerHostOk(res, 'read a build log')
  return (await res.json()) as BuildLogChunk
}
