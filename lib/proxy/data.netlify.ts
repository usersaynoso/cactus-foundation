// lib/proxy/data.ts for Netlify builds (swapped in by next.config.ts).
//
// On Netlify proxy.ts runs as an edge function, which cannot load Prisma. Every
// answer here comes from app/api/internal/proxy-data/route.ts, a Node route that
// makes exactly the reads the Vercel proxy makes directly. The edge isolate keeps
// them for the same few seconds the Node caches do, so a page view costs one call
// at most and a burst of navigations costs one between them.
//
// Nothing here may reach lib/db/prisma or @prisma/client, not even for a type:
// type-only imports of local files, plus the protocol module, and that is all.

import type { MembersConfig } from '@/lib/members/config'
import type { ProxyAdminUser, ProxyMember, ProxyPageCache, ProxyRouteTier } from './data'
import {
  PROXY_DATA_PATH,
  PROXY_KEY_HEADER,
  proxyKey,
  type ProxyGateFailure,
  type ProxySessionAnswer,
  type ProxySessionRequest,
  type ProxySnapshot,
} from './protocol'

const SNAPSHOT_TTL_MS = 5_000
const SESSION_TTL_MS = 5_000
const SESSION_CACHE_MAX = 500

/** Thrown when the data route could not answer. `unconfigured` is the server's verdict. */
export class ProxyDataError extends Error {
  constructor(
    message: string,
    readonly unconfigured: boolean
  ) {
    super(message)
  }
}

// Netlify exposes site env vars to edge functions through Netlify.env; process.env
// is the fallback for runtimes that also populate it.
function readEnv(name: string): string | undefined {
  const netlify = (globalThis as { Netlify?: { env?: { get(key: string): string | undefined } } }).Netlify
  return netlify?.env?.get(name) ?? (typeof process !== 'undefined' ? process.env[name] : undefined)
}

// The proxy calls its own site, so it needs its own address. The request in hand
// is the most reliable source - set by proxy.ts on every request - with the
// platform's address as a fallback.
let origin: string | null = null
export function rememberRequestOrigin(requestOrigin: string): void {
  origin = requestOrigin
}

function baseUrl(): string {
  const url = origin ?? readEnv('URL') ?? readEnv('SITE_URL')
  if (!url) throw new ProxyDataError('The proxy does not know its own address yet', false)
  return url.replace(/\/+$/, '')
}

let keyPromise: Promise<string | null> | null = null
function authHeader(): Promise<Record<string, string>> {
  keyPromise ??= (async () => {
    const secret = readEnv('SESSION_SECRET')
    return secret ? proxyKey(secret) : null
  })()
  return keyPromise.then((key): Record<string, string> => (key ? { [PROXY_KEY_HEADER]: key } : {}))
}

// ── Site snapshot ─────────────────────────────────────────────────────────────

let snapshot: ProxySnapshot | null = null
let snapshotAt = 0
let inflight: Promise<ProxySnapshot> | null = null
// Same latch as lib/config/site.ts: once the site is set up it stays set up for
// the life of the isolate, except on setup paths, which always re-read.
let firstRunLatched = false

async function fetchSnapshot(fresh: boolean): Promise<ProxySnapshot> {
  const res = await fetch(`${baseUrl()}${PROXY_DATA_PATH}${fresh ? '?fresh=1' : ''}`, {
    headers: await authHeader(),
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ProxyGateFailure | null
    throw new ProxyDataError(body?.error ?? `Proxy data route answered ${res.status}`, body?.unconfigured ?? false)
  }
  const data = (await res.json()) as ProxySnapshot
  snapshot = data
  snapshotAt = Date.now()
  if (data.firstRunComplete) firstRunLatched = true
  return data
}

function getSnapshot(fresh = false): Promise<ProxySnapshot> {
  if (!fresh && snapshot && Date.now() - snapshotAt < SNAPSHOT_TTL_MS) return Promise.resolve(snapshot)
  if (fresh) return fetchSnapshot(true)
  inflight ??= fetchSnapshot(false).finally(() => {
    inflight = null
  })
  return inflight
}

function field<K extends 'adminPath' | 'siteStatus' | 'pageCache' | 'membersConfig' | 'routeTiers'>(
  snap: ProxySnapshot,
  key: K
): NonNullable<ProxySnapshot[K]> | null {
  if (snap.failed.includes(key)) throw new ProxyDataError(`Could not read ${key}`, false)
  return snap[key] as NonNullable<ProxySnapshot[K]> | null
}

export async function isFirstRunComplete(): Promise<boolean> {
  if (firstRunLatched) return true
  return (await getSnapshot()).firstRunComplete
}

export async function refreshFirstRunComplete(): Promise<boolean> {
  const snap = await getSnapshot(true)
  firstRunLatched = snap.firstRunComplete
  return snap.firstRunComplete
}

export async function getAdminPathCached(): Promise<string | null> {
  return field(await getSnapshot(), 'adminPath')
}

export async function getSiteStatusCached(): Promise<ProxySnapshot['siteStatus']> {
  return field(await getSnapshot(), 'siteStatus')
}

export async function getPageCacheCached(): Promise<ProxyPageCache> {
  const pageCache = field(await getSnapshot(), 'pageCache')
  if (!pageCache) throw new ProxyDataError('Could not read pageCache', false)
  return pageCache
}

export async function getMembersConfigCached(): Promise<MembersConfig> {
  const config = field(await getSnapshot(), 'membersConfig')
  if (!config) throw new ProxyDataError('Could not read membersConfig', false)
  return config
}

export async function getModuleRouteTiersCached(): Promise<ProxyRouteTier[]> {
  return field(await getSnapshot(), 'routeTiers') ?? []
}

// ── Sessions ──────────────────────────────────────────────────────────────────

const sessions = new Map<string, { at: number; answer: ProxySessionAnswer }>()

async function checkSession(request: ProxySessionRequest): Promise<ProxySessionAnswer> {
  const cacheKey = `${request.kind}:${request.token}`
  const hit = sessions.get(cacheKey)
  if (hit && Date.now() - hit.at < SESSION_TTL_MS) return hit.answer

  const res = await fetch(`${baseUrl()}${PROXY_DATA_PATH}`, {
    method: 'POST',
    headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  })
  if (!res.ok) throw new ProxyDataError(`Session check answered ${res.status}`, false)
  const answer = (await res.json()) as ProxySessionAnswer

  // Bounded, oldest first: a Map iterates in insertion order.
  if (sessions.size >= SESSION_CACHE_MAX) {
    const oldest = sessions.keys().next().value
    if (oldest !== undefined) sessions.delete(oldest)
  }
  sessions.set(cacheKey, { at: Date.now(), answer })
  return answer
}

export async function validateSession(token: string): Promise<ProxyAdminUser | null> {
  const answer = await checkSession({ kind: 'admin', token })
  return answer.kind === 'admin' ? answer.user : null
}

export async function validateMemberSession(token: string): Promise<ProxyMember | null> {
  const answer = await checkSession({ kind: 'member', token })
  return answer.kind === 'member' ? answer.member : null
}

// ── Everything else ───────────────────────────────────────────────────────────

// Edge Config is a Vercel service; there is none on Netlify.
export function isEdgeConfigWritable(): boolean {
  return false
}

// Only the server can see what Prisma threw, so its verdict rides on the error.
export function gateFailureMeansUnconfigured(err: unknown): boolean {
  return err instanceof ProxyDataError && err.unconfigured
}
