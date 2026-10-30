import type { DomainSummary } from '@/cactus-host/protocol'
import { assertServerHostOk, serverHostFetch, sitePath } from './api'

// Domains on the owner's server. cactus-host adds the name to the site's Caddy file,
// and "serving" means a request to https://<name> really reached this site on this
// server - it asks for a value only this site knows, so a domain still pointing at the
// old host (Vercel, say) reads as not ready rather than as a false yes.

export async function addServerDomain(token: string, siteId: string, name: string): Promise<DomainSummary> {
  const res = await serverHostFetch(token, sitePath(siteId, '/domains'), {
    method: 'POST',
    body: { name },
    timeoutMs: 20_000,
  })
  await assertServerHostOk(res, `add ${name}`)
  return ((await res.json()) as { domain: DomainSummary }).domain
}

export async function getServerDomain(token: string, siteId: string, name: string): Promise<DomainSummary> {
  const res = await serverHostFetch(token, sitePath(siteId, `/domains/${encodeURIComponent(name)}`), {
    timeoutMs: 20_000,
  })
  await assertServerHostOk(res, `check ${name}`)
  return ((await res.json()) as { domain: DomainSummary }).domain
}
