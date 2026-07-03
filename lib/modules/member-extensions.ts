import { prisma } from '@/lib/db/prisma'
import type { ModuleManifest } from '@/lib/modules/manifest'

// Live reads of every active module's `memberExtensions` manifest field (see
// MEMBERS_SPEC.md amendment 5). Pure data - no codegen step, unlike
// extensionPoints/settingsTabs which need static component imports resolved
// at build time. Same active-module filter as app/cactus-admin/config/page.tsx.

async function getActiveModuleManifests(): Promise<ModuleManifest[]> {
  const modules = await prisma.module.findMany({
    where: { status: { in: ['active', 'update_available'] } },
    select: { manifest: true },
  })
  return modules
    .map((m) => m.manifest as unknown as ModuleManifest | null)
    .filter((m): m is ModuleManifest => !!m)
}

export async function getModuleActivityTypes(): Promise<Array<{ type: string; label: string }>> {
  const manifests = await getActiveModuleManifests()
  return manifests.flatMap((m) => m.memberExtensions?.activityTypes ?? [])
}

export async function getModuleNotificationCategories(): Promise<Array<{ category: string; label: string }>> {
  const manifests = await getActiveModuleManifests()
  return manifests.flatMap((m) => m.memberExtensions?.notificationCategories ?? [])
}

export async function getModuleDataExportPaths(): Promise<Array<{ moduleName: string; path: string }>> {
  const modules = await prisma.module.findMany({
    where: { status: { in: ['active', 'update_available'] } },
    select: { name: true, manifest: true },
  })
  const result: Array<{ moduleName: string; path: string }> = []
  for (const m of modules) {
    const manifest = m.manifest as unknown as ModuleManifest | null
    const path = manifest?.memberExtensions?.dataExportPath
    if (path) result.push({ moduleName: m.name, path })
  }
  return result
}

export async function getModuleRouteTiers(): Promise<Array<{ pathPrefix: string; tier: 'PUBLIC' | 'MEMBER' | 'TRUSTED_MEMBER' }>> {
  const manifests = await getActiveModuleManifests()
  return manifests.flatMap((m) => m.memberExtensions?.routeTiers ?? [])
}

// 5-second in-memory cache for proxy.ts, which calls this on every request -
// same pattern as getAdminPathCached/getMembersConfigCached (safe since
// proxy.ts runs on the Node runtime, not Edge).
let cachedRouteTiers: Array<{ pathPrefix: string; tier: 'PUBLIC' | 'MEMBER' | 'TRUSTED_MEMBER' }> | null = null
let cachedRouteTiersAt = 0
const ROUTE_TIERS_CACHE_TTL_MS = 5_000

export async function getModuleRouteTiersCached(): Promise<Array<{ pathPrefix: string; tier: 'PUBLIC' | 'MEMBER' | 'TRUSTED_MEMBER' }>> {
  const now = Date.now()
  if (cachedRouteTiers && now - cachedRouteTiersAt < ROUTE_TIERS_CACHE_TTL_MS) return cachedRouteTiers
  const tiers = await getModuleRouteTiers()
  cachedRouteTiers = tiers
  cachedRouteTiersAt = now
  return tiers
}
