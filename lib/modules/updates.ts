// Live update-availability check shared by the core-update panel (to offer bundling
// module updates into a core-update deploy) and, indirectly, the same logic the
// per-module check (GET /api/admin/modules/[id]) already performs. Pure detection only -
// callers decide what to persist, since the core-update flow and the Modules page want
// different DB side effects (queue a deploy vs. flag "update available").
import { prisma } from '@/lib/db/prisma'
import { getLatestRelease } from './github'
import { compareVersions } from '@/lib/updates/core'

export type ModuleUpdateInfo = {
  id: string
  name: string
  repoUrl: string
  currentVersion: string
  latestTag: string
  releaseBody: string | null
}

// `failures`, when given, collects the modules whose check itself failed (a repo the
// site's GitHub App cannot see, say), which would otherwise look the same as current.
export async function findModuleUpdates(failures?: Array<{ name: string; error: string }>): Promise<ModuleUpdateInfo[]> {
  const modules = await prisma.module.findMany({
    // Deliberately NOT INSTALLED_MODULE_WHERE. Everywhere else, a module mid-deploy
    // still counts as live; here it must not. A `deploying` row holds the old tag in
    // `version` and the new one in `pendingVersion`, so including it would compare
    // against the version being replaced and re-offer the update already in flight.
    where: { status: { in: ['active', 'update_available'] } },
  })

  const results = await Promise.all(
    modules.map(async (mod): Promise<ModuleUpdateInfo | null> => {
      try {
        const release = await getLatestRelease(mod.repoUrl, mod.updateChannel as 'public' | 'beta')
        if (!release || compareVersions(release.tag, mod.version) <= 0) return null
        return {
          id: mod.id,
          name: mod.name,
          repoUrl: mod.repoUrl,
          currentVersion: mod.version,
          latestTag: release.tag,
          releaseBody: release.body,
        }
      } catch (err) {
        console.error(`[modules] Update check failed for ${mod.name}:`, err)
        failures?.push({ name: mod.name, error: err instanceof Error ? err.message : String(err) })
        return null
      }
    })
  )

  return results.filter((r): r is ModuleUpdateInfo => r !== null)
}
