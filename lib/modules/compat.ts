import { compareVersions } from '@/lib/updates/core'
import { fetchManifestFromRepo, parseModuleManifest } from './manifest'
import {
  findUnmetModuleDependencies,
  type InstalledModuleVersion,
  type ModuleDependency,
} from './dependencies'

// What a module version demands of the site it is going onto, read from the
// manifest at the tag about to be installed.
export type ModuleRequirements = {
  requiresCoreVersion?: string
  requiresModules: ModuleDependency[]
}

// Reads those requirements, or null when the manifest can't be fetched or
// parsed. Null means "no opinion, let it through": mirrors the single-module
// update path, so a transient GitHub hiccup never blocks an otherwise-fine
// update.
//
// Split out from the check below so a caller judging several modules against a
// set that changes as it goes (the bulk "update all" path) reads each manifest
// once and re-judges from memory, rather than re-fetching every sweep.
export async function fetchModuleRequirements(
  repoUrl: string,
  ref?: string
): Promise<ModuleRequirements | null> {
  try {
    const manifest = parseModuleManifest(
      await fetchManifestFromRepo(repoUrl, 'cactus.module.json', ref)
    )
    return {
      requiresCoreVersion: manifest.requiresCoreVersion,
      requiresModules: manifest.requiresModules,
    }
  } catch {
    return null
  }
}

// Whether the running core and the given installed set satisfy those
// requirements. Returns a short human-readable reason when they do NOT, or null
// when it is fine to proceed. Pure - no network - so it can be re-run against a
// changing installed set.
export function reasonForUnmetRequirements(
  requirements: ModuleRequirements | null,
  coreVersion: string,
  installed: InstalledModuleVersion[]
): string | null {
  if (!requirements) return null

  if (
    requirements.requiresCoreVersion &&
    compareVersions(coreVersion, requirements.requiresCoreVersion) < 0
  ) {
    return `needs Cactus v${requirements.requiresCoreVersion} or newer (this site is on v${coreVersion})`
  }

  const [unmet] = findUnmetModuleDependencies(requirements.requiresModules, installed)
  if (unmet) {
    return unmet.reason === 'outdated'
      ? `needs "${unmet.name}" v${unmet.minVersion} or newer (v${unmet.installedVersion.replace(/^v/i, '')} installed)`
      : `needs the "${unmet.name}" module (v${unmet.minVersion} or newer) installed and active`
  }

  return null
}

// One module's proposed move, as judged by resolveUpdateBatch below.
export type UpdateCandidate<T> = {
  module: T
  name: string
  tag: string
  requirements: ModuleRequirements | null
}

// Which of a batch of proposed module updates can go into ONE build together.
//
// Modules are released in chains: shop 0.1.336, then shop-variations 0.1.169
// which requires it, then product-addons 0.1.31 which requires both. Judging
// every candidate against the installed set as it stands BEFORE the batch
// rejects each link whose prerequisite the batch itself is about to supply -
// so "Update all" pins the root of the chain, silently drops the rest, and the
// owner has to click again and sit through another full build once per layer.
//
// Everything accepted here lands in one commit and therefore one build, so a
// dependency this batch satisfies is satisfied by the build that carries it.
// Accept in rounds against a set that grows as modules go in, and stop when a
// whole sweep accepts nothing: whatever is left is blocked by something the
// batch cannot supply, and comes back with the reason it was left out.
//
// Rounds rather than a topological sort because the candidates arrive in no
// useful order, and a fixed point needs no assumption about one.
export function resolveUpdateBatch<T>(args: {
  candidates: UpdateCandidate<T>[]
  coreVersion: string
  installed: InstalledModuleVersion[]
}): { accepted: UpdateCandidate<T>[]; blocked: { candidate: UpdateCandidate<T>; reason: string }[] } {
  const effective = new Map<string, InstalledModuleVersion>(args.installed.map((m) => [m.name, m]))
  const accepted: UpdateCandidate<T>[] = []
  let remaining = args.candidates

  for (;;) {
    const stuck: UpdateCandidate<T>[] = []
    for (const candidate of remaining) {
      const reason = reasonForUnmetRequirements(
        candidate.requirements,
        args.coreVersion,
        [...effective.values()]
      )
      if (reason) {
        stuck.push(candidate)
        continue
      }
      // A module being updated stays installed and active; only its version moves.
      effective.set(candidate.name, { name: candidate.name, version: candidate.tag, status: 'active' })
      accepted.push(candidate)
    }
    if (stuck.length === remaining.length) {
      return {
        accepted,
        blocked: stuck.map((candidate) => ({
          candidate,
          reason:
            reasonForUnmetRequirements(candidate.requirements, args.coreVersion, [...effective.values()]) ??
            'requirements not met',
        })),
      }
    }
    remaining = stuck
  }
}

// Reads a module's manifest at the tag about to be installed and checks the
// running core and the installed module set satisfy its declared requirements
// (requiresCoreVersion / requiresModules). Returns a short human-readable reason
// when the module is NOT compatible, or null when it is fine to proceed.
//
// This is the pre-check the single-module install/update paths run before a
// module reaches modules.json, without which one incompatible module breaks
// every future build on a missing import.
export async function checkModuleUpdateCompat(args: {
  repoUrl: string
  coreVersion: string
  installed: InstalledModuleVersion[]
  ref?: string
}): Promise<string | null> {
  const requirements = await fetchModuleRequirements(args.repoUrl, args.ref)
  return reasonForUnmetRequirements(requirements, args.coreVersion, args.installed)
}
