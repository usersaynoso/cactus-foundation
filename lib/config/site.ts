import { cache } from 'react'
import { randomInt } from 'crypto'
import { prisma } from '@/lib/db/prisma'
import type { SiteConfig, SiteStatus } from '@prisma/client'

// In-memory cache for the site config when Edge Config write credentials
// aren't available. Safe to do in proxy.ts since it runs on Node.js runtime.
let cachedAdminPath: string | null = null
let cachedAdminPathAt: number = 0
let cachedStatus: SiteStatus | null = null
let cachedStatusAt: number = 0
let cachedPendingRedeployId: string | null = null
let cachedPendingRedeployIdAt: number = 0
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

export async function getAdminPathCached(): Promise<string | null> {
  const now = Date.now()
  if (cachedAdminPath && now - cachedAdminPathAt < CACHE_TTL_MS) {
    return cachedAdminPath
  }
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { adminPath: true },
  })
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
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { status: true },
  })
  if (config) {
    cachedStatus = config.status
    cachedStatusAt = now
  }
  return config?.status ?? null
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

export async function getPendingRedeployIdUncached(): Promise<string | null> {
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { pendingRedeployId: true, pendingRedeployAt: true },
  })
  const resolved = config ? await resolvePendingRedeploy(config) : null
  cachedPendingRedeployId = resolved
  cachedPendingRedeployIdAt = Date.now()
  return resolved
}

export function invalidateSiteConfigCache() {
  cachedAdminPath = null
  cachedAdminPathAt = 0
  cachedStatus = null
  cachedStatusAt = 0
  cachedPendingRedeployId = null
  cachedPendingRedeployIdAt = 0
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
