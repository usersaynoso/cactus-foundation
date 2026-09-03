import { compareVersions } from '@/lib/updates/core'

// A module's declared dependency on another module (manifest.requiresModules).
export type ModuleDependency = { name: string; minVersion: string }

// The subset of an installed Module row needed to judge a dependency. pendingVersion
// is the tag a row already going out is moving to - see effectiveVersion below.
export type InstalledModuleVersion = {
  name: string
  version: string
  status: string
  pendingVersion?: string | null
}

export type UnmetModuleDependency = ModuleDependency & (
  // Not installed at all, disabled, or failed.
  | { reason: 'missing' }
  // Installed and enabled, but older than minVersion.
  | { reason: 'outdated'; installedVersion: string }
)

// Whether a row counts as present for the deployment this action is about to make.
//
// The rule is deliberately the same one the core sync uses when it writes
// modules.json (`status notIn ['failed','inactive']`): a module counts as a
// dependency exactly when it will be pinned into the registry that build reads.
//
// Insisting on a literal 'active' instead - which this did - reported perfectly
// present modules as MISSING. Two everyday cases hit it: a dependency that merely
// has a newer release waiting ('update_available'), and a dependency already
// mid-update in the very batch the owner ticked ('deploying' / 'pending_deploy').
// The second is what refused "install product-discovery-tool and update the rest"
// with "requires the shop module to be installed and active first", on a site where
// shop was installed, active and already going out at the required version.
export function isInstalledForDependencies(status: string): boolean {
  return status !== 'failed' && status !== 'inactive'
}

// The version a row will be on once the deployment lands. A row mid-update holds the
// incoming tag in pendingVersion while `version` still reads the confirmed one, and
// modules.json is already pinned to the former - so pendingVersion is what the build
// this dependency check is gating actually carries.
function effectiveVersion(row: InstalledModuleVersion): string {
  return row.pendingVersion ?? row.version
}

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
    if (!found || !isInstalledForDependencies(found.status)) {
      unmet.push({ ...dep, reason: 'missing' })
      continue
    }
    const version = effectiveVersion(found)
    if (compareVersions(version, dep.minVersion) < 0) {
      unmet.push({ ...dep, reason: 'outdated', installedVersion: version })
    }
  }
  return unmet
}
