import { cache } from 'react'
import { randomInt } from 'crypto'
import { prisma } from '@/lib/db/prisma'
import type { SiteConfig, SiteStatus } from '@prisma/client'
import { DEFAULT_PAGE_CACHE_TTL, normalisePageCacheTtl } from '@/lib/cache/page-cache'

// In-memory cache for the site config when Edge Config write credentials
// aren't available. Safe to do in proxy.ts since it runs on Node.js runtime.
let cachedAdminPath: string | null = null
let cachedAdminPathAt: number = 0
let cachedStatus: SiteStatus | null = null
let cachedStatusAt: number = 0
let cachedPendingRedeployId: string | null = null
let cachedPendingRedeployIdAt: number = 0
let cachedSpeedInsights: boolean = true
let cachedSpeedInsightsAt: number = 0
let cachedPageCache: { enabled: boolean; ttl: number } = { enabled: false, ttl: DEFAULT_PAGE_CACHE_TTL }
let cachedPageCacheAt: number = 0
let cachedBehindCloudflare: boolean = false
let cachedBehindCloudflareAt: number = 0
const CACHE_TTL_MS = 5_000 // 5 seconds
// Server-side safety net: the redeploy gate auto-releases after this window so an admin
// is never permanently trapped if the webhook/client/token path never clears the flag.
// Module-update deploys run checkout-modules.mjs (a network git clone) mid-build on top
// of the normal Next.js build, so plain core deploys and module deploys don't share a
// ceiling — 4 min covers both with headroom.
const REDEPLOY_MAX_MS = 4 * 60_000

// Wrapped in React cache() because module render paths call this once per block
// that needs a design token (a product grid asks for the breakpoints for every
// card it stamps), and it reads the whole singleton row. Per-request only, so an
// admin saving settings still sees the change on the next request.
export const getSiteConfig = cache(async (): Promise<SiteConfig | null> => {
  return prisma.siteConfig.findUnique({ where: { id: 'singleton' } })
})

// Both readers below run on proxy.ts's hot path, where a thrown error is not an
// error page but a bare 500 for whatever the visitor asked for. The 5-second TTL
// means a cold instance always misses, so a single connection blip - most likely
// exactly when an instance is spinning up after a quiet spell - used to take out
// the request. Serve the last known value instead: stale for a few seconds beats
// dead, and the value only changes when an admin edits it.
export async function getAdminPathCached(): Promise<string | null> {
  const now = Date.now()
  if (cachedAdminPath && now - cachedAdminPathAt < CACHE_TTL_MS) {
    return cachedAdminPath
  }
  const config = await prisma.siteConfig
    .findUnique({
      where: { id: 'singleton' },
      select: { adminPath: true },
    })
    .catch(() => undefined)
  if (config === undefined) return cachedAdminPath
  if (config) {
    cachedAdminPath = config.adminPath
    cachedAdminPathAt = now
  }
  return config?.adminPath ?? null
}

export async function getSiteStatusCached(): Promise<SiteStatus | null> {
  const now = Date.now()
  if (cachedStatus && now - cachedStatusAt < CACHE_TTL_MS) {
    return cachedStatus
  }
  const config = await prisma.siteConfig
    .findUnique({
      where: { id: 'singleton' },
      select: { status: true },
    })
    .catch(() => undefined)
  if (config === undefined) return cachedStatus
  if (config) {
    cachedStatus = config.status
    cachedStatusAt = now
  }
  return config?.status ?? null
}

// Read by the root layout on every route to decide whether to load Vercel's
// Speed Insights script, so it gets the same treatment as the two readers above:
// a short in-memory TTL (the value changes only when an admin flicks the switch)
// and a best-effort read. A DB blip must not take out the root layout - it wraps
// error pages too - so a failed read falls back to on, which is what every
// install did before the switch existed.
export async function isSpeedInsightsEnabled(): Promise<boolean> {
  const now = Date.now()
  if (cachedSpeedInsightsAt > 0 && now - cachedSpeedInsightsAt < CACHE_TTL_MS) {
    return cachedSpeedInsights
  }
  const config = await prisma.siteConfig
    .findUnique({
      where: { id: 'singleton' },
      select: { speedInsightsEnabled: true },
    })
    .catch(() => undefined)
  if (config === undefined) return cachedSpeedInsights
  cachedSpeedInsights = config?.speedInsightsEnabled ?? true
  cachedSpeedInsightsAt = now
  return cachedSpeedInsights
}

// Read by proxy.ts on every public page request to decide whether the response
// may be held by a shared cache (Settings > General > Speed). Same treatment as
// the readers above: a short in-memory TTL, because the value changes only when
// an admin flicks the switch, and a best-effort read.
//
// A failed read falls back to the last known value and ultimately to OFF, which
// is what every install did before the switch existed. Failing closed matters
// more here than elsewhere: the cost of wrongly deciding "not cacheable" is one
// uncached page, and the cost of wrongly deciding "cacheable" is a page held by
// a CDN for the whole window.
export async function getPageCacheCached(): Promise<{ enabled: boolean; ttl: number }> {
  const now = Date.now()
  if (cachedPageCacheAt > 0 && now - cachedPageCacheAt < CACHE_TTL_MS) {
    return cachedPageCache
  }
  const config = await prisma.siteConfig
    .findUnique({
      where: { id: 'singleton' },
      select: { pageCacheEnabled: true, pageCacheTtl: true },
    })
    .catch(() => undefined)
  if (config === undefined) return cachedPageCache
  cachedPageCache = {
    enabled: config?.pageCacheEnabled ?? false,
    ttl: normalisePageCacheTtl(config?.pageCacheTtl),
  }
  cachedPageCacheAt = now
  return cachedPageCache
}

// Read by the rate limiter to decide whether CF-Connecting-IP can be believed.
// Same short in-memory TTL as the readers above.
//
// Fails closed, and that is the whole point: CF-Connecting-IP is a header any
// caller can invent, so believing it on a site that is NOT actually behind
// Cloudflare hands out a forgeable client IP and walks straight through every
// per-IP limit. A failed read therefore falls back to the last known value and
// ultimately to false - the pre-existing behaviour - rather than to true.
export async function isBehindCloudflare(): Promise<boolean> {
  const now = Date.now()
  if (cachedBehindCloudflareAt > 0 && now - cachedBehindCloudflareAt < CACHE_TTL_MS) {
    return cachedBehindCloudflare
  }
  const config = await prisma.siteConfig
    .findUnique({
      where: { id: 'singleton' },
      select: { behindCloudflare: true },
    })
    .catch(() => undefined)
  if (config === undefined) return cachedBehindCloudflare
  cachedBehindCloudflare = config?.behindCloudflare ?? false
  cachedBehindCloudflareAt = now
  return cachedBehindCloudflare
}

async function resolvePendingRedeploy(
  row: { pendingRedeployId: string | null; pendingRedeployAt: Date | null }
): Promise<string | null> {
  const id = row.pendingRedeployId
  if (!id) return null
  const at = row.pendingRedeployAt
  // NULL timestamp => legacy/stuck row => treat as expired (self-heals the current trap).
  const expired = at === null || Date.now() - at.getTime() > REDEPLOY_MAX_MS
  if (!expired) return id
  try {
    await prisma.siteConfig.update({
      where: { id: 'singleton' },
      data: { pendingRedeployId: null, pendingRedeployAt: null },
    })
  } catch {
    // best-effort: still return null so this request is unblocked; next request retries
  }
  cachedPendingRedeployId = null
  cachedPendingRedeployIdAt = Date.now()
  return null
}

export async function getPendingRedeployIdCached(): Promise<string | null> {
  const now = Date.now()
  if (cachedPendingRedeployIdAt > 0 && now - cachedPendingRedeployIdAt < CACHE_TTL_MS) {
    return cachedPendingRedeployId
  }
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { pendingRedeployId: true, pendingRedeployAt: true },
  })
  const resolved = config ? await resolvePendingRedeploy(config) : null
  cachedPendingRedeployId = resolved
  cachedPendingRedeployIdAt = now
  return resolved
}

export function invalidateSiteConfigCache() {
  cachedAdminPath = null
  cachedAdminPathAt = 0
  cachedStatus = null
  cachedStatusAt = 0
  cachedPendingRedeployId = null
  cachedPendingRedeployIdAt = 0
  cachedSpeedInsights = true
  cachedSpeedInsightsAt = 0
  cachedPageCache = { enabled: false, ttl: DEFAULT_PAGE_CACHE_TTL }
  cachedPageCacheAt = 0
  cachedBehindCloudflare = false
  cachedBehindCloudflareAt = 0
  cachedFirstRunComplete = false
}

export async function isSetupComplete(): Promise<boolean> {
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { setupCompleted: true },
  })
  return config?.setupCompleted ?? false
}

// ── First-run gate ──────────────────────────────────────────────────────────
// proxy.ts checks this on every single request - every page, every RSC
// navigation, every API call - so a "complete" verdict is latched in memory
// rather than re-queried. No TTL: while the gate is still closed it re-reads on
// every call, and once open it only ever closes again through a reset, which is
// handled below.
//
// The gate is "setupCompleted AND at least one user account exists": wiping the
// users re-opens it so /api/setup/reset can run (see proxy.ts). That means the
// verdict is NOT a one-way latch in practice - the hard reset in
// app/api/admin/reset-database (deleteSetupData) truncates User and SiteConfig
// and then sends the admin to /setup, and /api/setup/reset clears the flag
// directly. Neither goes through invalidateSiteConfigCache(), so a warm instance
// holding a stale latch would 404 the very wizard it just redirected to. proxy.ts
// therefore calls refreshFirstRunComplete() on setup paths and never trusts the
// latch there - free, since those paths are dead on a live site.
let cachedFirstRunComplete = false

export async function isFirstRunComplete(): Promise<boolean> {
  if (cachedFirstRunComplete) return true
  return refreshFirstRunComplete()
}

export async function refreshFirstRunComplete(): Promise<boolean> {
  const [config, anyUser] = await Promise.all([
    prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { setupCompleted: true },
    }),
    // Existence check, not COUNT(*) over the whole User table: the gate only
    // ever compares the answer against zero.
    prisma.user.findFirst({ select: { id: true } }),
  ])
  cachedFirstRunComplete = (config?.setupCompleted ?? false) && !!anyUser
  return cachedFirstRunComplete
}

// Slug/path blocklist — same pattern used for admin path and usernames
const BLOCKLIST = new Set([
  'admin',
  'administrator',
  'root',
  'support',
  'moderator',
  'mod',
  'system',
  'owner',
  'staff',
  'api',
  'setup',
  'login',
  'logout',
  'register',
  'auth',
  // Members system: default member-area path, public profile prefix, and
  // the verification holding page (see MEMBERS_SPEC.md)
  'account',
  'members',
  'verify-email',
  'health',
  'sitemap',
  'robots',
  'favicon',
  'static',
  'public',
  'assets',
  'images',
  'img',
  'uploads',
  'media',
  'cdn',
  'www',
  'mail',
  'email',
  'help',
  'about',
  'contact',
  'privacy',
  'terms',
  'legal',
  'dmca',
  'news',
  'blog',
  'feed',
  'rss',
  'atom',
  'null',
  'undefined',
  'true',
  'false',
])

export function isBlocklisted(value: string): boolean {
  return BLOCKLIST.has(value.toLowerCase())
}

// The admin URL is meant to be unguessable - that obscurity is the whole point
// of suggesting a random one. Math.random() is a predictable PRNG: sample a few
// outputs (or just know roughly when the site was set up) and the sequence can be
// reproduced, which would hand out the admin path. Use the CSPRNG.
export function generateSuggestedAdminPath(): string {
  const words = [
    'lemon', 'cactus', 'prickly', 'desert', 'oasis', 'bloom',
    'grove', 'canyon', 'mesa', 'ridge', 'valley', 'creek',
  ]
  const word = words[randomInt(0, words.length)] ?? 'lemon'
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let suffix = ''
  for (let i = 0; i < 6; i++) suffix += alphabet[randomInt(0, alphabet.length)]
  return `${word}-${suffix}`
}
