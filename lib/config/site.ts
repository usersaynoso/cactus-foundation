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

export async function getSiteConfig(): Promise<SiteConfig | null> {
  return prisma.siteConfig.findUnique({ where: { id: 'singleton' } })
}

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

export async function getPendingRedeployIdCached(): Promise<string | null> {
  const now = Date.now()
  if (cachedPendingRedeployIdAt > 0 && now - cachedPendingRedeployIdAt < CACHE_TTL_MS) {
    return cachedPendingRedeployId
  }
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { pendingRedeployId: true },
  })
  cachedPendingRedeployId = config?.pendingRedeployId ?? null
  cachedPendingRedeployIdAt = now
  return cachedPendingRedeployId
}

export function invalidateSiteConfigCache() {
  cachedAdminPath = null
  cachedAdminPathAt = 0
  cachedStatus = null
  cachedStatusAt = 0
  cachedPendingRedeployId = null
  cachedPendingRedeployIdAt = 0
}

export async function isSetupComplete(): Promise<boolean> {
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { setupCompleted: true },
  })
  return config?.setupCompleted ?? false
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

export function generateSuggestedAdminPath(): string {
  const words = [
    'lemon', 'cactus', 'prickly', 'desert', 'oasis', 'bloom',
    'grove', 'canyon', 'mesa', 'ridge', 'valley', 'creek',
  ]
  const word = words[Math.floor(Math.random() * words.length)] ?? 'lemon'
  const suffix = Math.random().toString(36).slice(2, 8)
  return `${word}-${suffix}`
}
