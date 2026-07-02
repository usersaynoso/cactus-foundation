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

export async function findModuleUpdates(): Promise<ModuleUpdateInfo[]> {
  const modules = await prisma.module.findMany({
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
        return null
      }
    })
  )

  return results.filter((r): r is ModuleUpdateInfo => r !== null)
}
