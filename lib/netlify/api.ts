// Thin client for the Netlify REST API (https://open-api.netlify.com). Only the
// handful of calls Cactus needs: read a site, list sites, and the env-var and deploy
// endpoints in ./env and ./deploy.

export const NETLIFY_API = 'https://api.netlify.com/api/v1'

export class NetlifyApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

export async function netlifyFetch(
  token: string,
  path: string,
  init: { method?: string; body?: unknown; timeoutMs?: number } = {}
): Promise<Response> {
  return fetch(`${NETLIFY_API}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(init.timeoutMs ?? 15_000),
  })
}

/** Throws a NetlifyApiError carrying the status and the start of the body. */
export async function assertNetlifyOk(res: Response, what: string): Promise<void> {
  if (res.ok) return
  const body = await res.text().catch(() => '')
  throw new NetlifyApiError(`Netlify ${what} failed (${res.status}): ${body.slice(0, 300)}`, res.status)
}

export type NetlifySite = {
  id: string
  name: string
  url?: string
  ssl_url?: string
  admin_url?: string
  custom_domain?: string | null
  domain_aliases?: string[]
  account_id?: string
  account_slug?: string
  build_settings?: {
    provider?: string
    repo_path?: string
    repo_url?: string
    repo_branch?: string
  }
}

export async function getNetlifySite(token: string, siteId: string): Promise<NetlifySite | null> {
  try {
    const res = await netlifyFetch(token, `/sites/${encodeURIComponent(siteId)}`, { timeoutMs: 10_000 })
    if (!res.ok) return null
    return (await res.json()) as NetlifySite
  } catch {
    return null
  }
}

/** Every site the token can see, across all of its teams. */
export async function listNetlifySites(token: string): Promise<NetlifySite[]> {
  const res = await netlifyFetch(token, '/sites?filter=all&per_page=100', { timeoutMs: 10_000 })
  await assertNetlifyOk(res, 'list sites')
  return (await res.json()) as NetlifySite[]
}

/** The `owner/repo` a site builds from, when it is linked to GitHub. */
export function netlifyGithubRepo(site: NetlifySite): string | null {
  const settings = site.build_settings
  if (settings?.provider !== 'github' || !settings.repo_path) return null
  return /^[^/\s]+\/[^/\s]+$/.test(settings.repo_path) ? settings.repo_path : null
}

/**
 * Every hostname the site answers on: its custom domain, any aliases, and the
 * `<name>.netlify.app` address every site gets.
 */
export function netlifySiteDomains(site: NetlifySite): string[] {
  const out = new Set<string>()
  if (site.custom_domain) out.add(site.custom_domain)
  for (const alias of site.domain_aliases ?? []) out.add(alias)
  out.add(`${site.name}.netlify.app`)
  return [...out]
}

/**
 * Hostnames Netlify has a live certificate for. Netlify only issues one once DNS for
 * the domain points at it, so "in this list" is the same promise Vercel's verified +
 * not-misconfigured pair gives: the domain is genuinely serving this site.
 */
export async function getNetlifyCertifiedDomains(token: string, siteId: string): Promise<string[]> {
  try {
    const res = await netlifyFetch(token, `/sites/${encodeURIComponent(siteId)}/ssl`, { timeoutMs: 10_000 })
    if (!res.ok) return []
    const data = (await res.json()) as { state?: string; domains?: string[] }
    return data.state === 'issued' ? (data.domains ?? []) : []
  } catch {
    return []
  }
}
