import { compareVersions } from '@/lib/updates/core'

// A module's declared dependency on another module (manifest.requiresModules).
export type ModuleDependency = { name: string; minVersion: string }

// The subset of an installed Module row needed to judge a dependency.
export type InstalledModuleVersion = { name: string; version: string; status: string }

export type UnmetModuleDependency = ModuleDependency & (
  // Not installed at all, or installed but not active.
  | { reason: 'missing' }
  // Installed and active, but older than minVersion.
  | { reason: 'outdated'; installedVersion: string }
)

// Which of a manifest's declared module dependencies the site doesn't satisfy.
// Shared by the install route (refuse before the module reaches modules.json)
// and the update route (refuse before a newer release reaches modules.json) -
// both break the site's next build on a missing module import otherwise.
export function findUnmetModuleDependencies(
  requiresModules: ModuleDependency[],
  installed: InstalledModuleVersion[]
): UnmetModuleDependency[] {
  const unmet: UnmetModuleDependency[] = []
  for (const dep of requiresModules) {
    const found = installed.find((m) => m.name === dep.name)
    if (!found || found.status !== 'active') {
      unmet.push({ ...dep, reason: 'missing' })
      continue
    }
    if (compareVersions(found.version, dep.minVersion) < 0) {
      unmet.push({ ...dep, reason: 'outdated', installedVersion: found.version })
    }
  }
  return unmet
}
