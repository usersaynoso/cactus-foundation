import { compareVersions } from '@/lib/updates/core'
import { fetchManifestFromRepo, parseModuleManifest } from './manifest'
import { findUnmetModuleDependencies, type InstalledModuleVersion } from './dependencies'

// Reads a module's manifest at the tag about to be installed and checks the
// running core and the installed module set satisfy its declared requirements
// (requiresCoreVersion / requiresModules). Returns a short human-readable reason
// when the module is NOT compatible, or null when it is fine to proceed.
//
// This is the same pre-check the single-module install/update paths run before a
// module reaches modules.json - shared here so the bulk "update all" path applies
// it per module too, rather than pinning every latest tag blindly and letting one
// incompatible module break every future build on a missing import.
//
// A manifest that can't be fetched returns null (compatible): mirrors the
// single-module update path, so a transient GitHub hiccup never blocks an
// otherwise-fine update.
export async function checkModuleUpdateCompat(args: {
  repoUrl: string
  coreVersion: string
  installed: InstalledModuleVersion[]
  ref?: string
}): Promise<string | null> {
  let manifest
  try {
    manifest = parseModuleManifest(
      await fetchManifestFromRepo(args.repoUrl, 'cactus.module.json', args.ref)
    )
  } catch {
    return null
  }

  if (
    manifest.requiresCoreVersion &&
    compareVersions(args.coreVersion, manifest.requiresCoreVersion) < 0
  ) {
    return `needs Cactus v${manifest.requiresCoreVersion} or newer (this site is on v${args.coreVersion})`
  }

  const [unmet] = findUnmetModuleDependencies(manifest.requiresModules, args.installed)
  if (unmet) {
    return unmet.reason === 'outdated'
      ? `needs "${unmet.name}" v${unmet.minVersion} or newer (v${unmet.installedVersion.replace(/^v/i, '')} installed)`
      : `needs the "${unmet.name}" module (v${unmet.minVersion} or newer) installed and active`
  }

  return null
}
