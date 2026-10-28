// The wire format between the Netlify edge proxy (lib/proxy/data.netlify.ts) and
// the Node route that answers it (app/api/internal/proxy-data/route.ts).
//
// Type imports only, on purpose: the edge side must not pull anything that
// reaches Prisma, and Web Crypto is the one HMAC both runtimes have built in.

import type { MembersConfig } from '@/lib/members/config'
import type { ProxyPageCache, ProxyRouteTier } from './data'

export const PROXY_DATA_PATH = '/api/internal/proxy-data'
export const PROXY_KEY_HEADER = 'x-cactus-proxy-key'

// The site-wide facts the proxy needs on every request, fetched together so one
// call covers a page view. Each read can fail on its own; a failed field is listed
// in `failed` and its getter throws on the edge, exactly as the Prisma call it
// stands in for would have.
export type ProxySnapshot = {
  firstRunComplete: boolean
  adminPath: string | null
  siteStatus: 'live' | 'comingSoon' | 'maintenance' | null
  pageCache: ProxyPageCache | null
  membersConfig: MembersConfig | null
  routeTiers: ProxyRouteTier[] | null
  failed: Array<'adminPath' | 'siteStatus' | 'pageCache' | 'membersConfig' | 'routeTiers'>
}

// Answer when the first-run read itself failed. `unconfigured` carries the
// server's verdict (lib/proxy/gate-failure.ts), since only the server can see
// what Prisma threw.
export type ProxyGateFailure = { error: string; unconfigured: boolean }

export type ProxySessionRequest = { kind: 'admin' | 'member'; token: string }
export type ProxySessionAnswer =
  | { kind: 'admin'; user: { id: string; role: { isProtected: boolean } } | null }
  | { kind: 'member'; member: { trusted: boolean } | null }

// The shared key: HMAC-SHA256 of a fixed label under SESSION_SECRET, hex. Both
// sides already hold SESSION_SECRET, so nothing new has to be provisioned.
export async function proxyKey(secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('cactus-proxy-data-v1'))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
