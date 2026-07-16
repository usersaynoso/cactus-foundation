// Pure planner for the modules.json pin check. Deliberately IO-free (no gh, no network,
// no filesystem) so it is trivially unit-testable - the network layer lives in
// pin-check.live.test.ts, which gathers the facts and hands them to planPinCheck.
//
// Why this check exists: scripts/checkout-modules.mjs clones each module with
// `--branch <version>` at the tag pinned in modules.json, so RELEASING A MODULE SHIPS
// NOTHING UNTIL ITS PIN MOVES. Nobody moved them, and by v0.5.459 all eleven pins had
// drifted behind their latest release (shop v0.1.28 vs 0.1.39, twilio v0.1.1 vs 0.1.12).
//
// The critical part is that a pin bump is NOT free-standing. shop-variations 0.1.7 and
// product-attributes-for-shop 0.1.2 both declare `requiresModules: shop >= 0.1.38`, so
// bumping either while shop stayed at v0.1.28 would clone a shop with no
// `product-editor/context` and fail the build on a missing module import. So this plans
// over the whole SET: it resolves every requiresModules and requiresCoreVersion edge
// against the versions the set would actually be pinned to, not one module at a time.

import { compareVersions } from '@/lib/updates/core'
import { findUnmetModuleDependencies, type ModuleDependency, type UnmetModuleDependency } from './dependencies'

// An entry as it appears in modules.json.
export interface RegistryEntry {
  name: string
  repoUrl?: string
  version?: string
}

// The only manifest fields that bear on whether a set of pins resolves.
export interface ModuleManifestFacts {
  name: string
  version: string
  requiresCoreVersion?: string
  requiresModules?: ModuleDependency[]
}

// A module pinned behind its own latest release.
export interface PinLag {
  name: string
  pinned: string
  latest: string
}

// The version a module would be pinned to in the set under test.
export interface PinTarget {
  name: string
  version: string
}

export interface UnmetCoreVersion {
  required: string
  coreVersion: string
}

// A module in the set whose declared requirements the set doesn't satisfy.
export interface PinSetProblem {
  name: string
  version: string
  unmetModules: UnmetModuleDependency[]
  unmetCore?: UnmetCoreVersion
}

export interface PinCheckPlan {
  // Pins behind their module's latest release - the rot this check exists to catch.
  lagging: PinLag[]
  // Entries with no `version` at all: checkout-modules falls back to default-branch HEAD,
  // so the build is whatever was pushed last. Unpinned is its own kind of broken.
  unpinned: string[]
  // The set as modules.json pins it TODAY is already incoherent - e.g. someone bumped
  // shop-variations by hand and left shop behind. This breaks the next build.
  currentProblems: PinSetProblem[]
  // The set that moving every lagging pin to its latest release would produce. A problem
  // here means the bump can't just be applied: core has to ship first, or the upstream
  // module declares a dependency nothing satisfies yet.
  proposedProblems: PinSetProblem[]
  // What the reconciled registry would pin, module by module.
  proposed: PinTarget[]
  // Manifests that couldn't be read at the version being judged. Never treated as "fine":
  // an unread manifest is an unresolved dependency edge, not an absent one.
  unknownManifests: string[]
}

// Tags carry a leading `v` (v0.1.39); manifest versions don't (0.1.39). compareVersions
// strips it, but the values also get reported to a human, so normalise on the way in.
function bare(version: string): string {
  return version.replace(/^v/, '')
}

// Manifests are per-TAG, not per-module: shop-variations 0.1.7 may require shop >= 0.1.38
// while 0.1.9 requires >= 0.1.45. Keying by name alone would judge the proposed set
// against the pinned set's requirements and miss exactly the trap this check is for.
export function manifestKey(name: string, version: string): string {
  return `${name}@${bare(version)}`
}

// Resolve one candidate set: every requiresModules edge against the set's own versions,
// every requiresCoreVersion against the core package version.
function findSetProblems(
  set: PinTarget[],
  manifests: Map<string, ModuleManifestFacts>,
  coreVersion: string,
  unknownManifests: string[]
): PinSetProblem[] {
  // checkout-modules clones every registered module, so within a build every entry in the
  // set is present and usable - `status: 'active'` is what that means to the resolver.
  const installed = set.map((target) => ({
    name: target.name,
    version: bare(target.version),
    status: 'active',
  }))

  const problems: PinSetProblem[] = []

  for (const target of set) {
    const manifest = manifests.get(manifestKey(target.name, target.version))
    if (!manifest) {
      unknownManifests.push(manifestKey(target.name, target.version))
      continue
    }

    const unmetModules = findUnmetModuleDependencies(manifest.requiresModules ?? [], installed)
    const unmetCore =
      manifest.requiresCoreVersion && compareVersions(coreVersion, manifest.requiresCoreVersion) < 0
        ? { required: manifest.requiresCoreVersion, coreVersion }
        : undefined

    if (unmetModules.length > 0 || unmetCore) {
      problems.push({ name: target.name, version: bare(target.version), unmetModules, unmetCore })
    }
  }

  return problems
}

// Given the registry, each module's latest release tag, the manifests at both the pinned
// and the latest tag (keyed by manifestKey), and core's package version, decide what
// lags and whether the current and proposed sets actually resolve.
export function planPinCheck(args: {
  entries: RegistryEntry[]
  latestByName: Map<string, string>
  manifests: Map<string, ModuleManifestFacts>
  coreVersion: string
}): PinCheckPlan {
  const { entries, latestByName, manifests, coreVersion } = args

  const lagging: PinLag[] = []
  const unpinned: string[] = []
  const current: PinTarget[] = []
  const proposed: PinTarget[] = []

  for (const entry of entries) {
    const latest = latestByName.get(entry.name)

    if (!entry.version) {
      unpinned.push(entry.name)
      // No pin means HEAD, and HEAD has no version to judge - it can only join the
      // proposed set, and only once a release exists to pin it to.
      if (latest) proposed.push({ name: entry.name, version: latest })
      continue
    }

    current.push({ name: entry.name, version: entry.version })
    proposed.push({ name: entry.name, version: latest ?? entry.version })

    if (latest && compareVersions(latest, entry.version) > 0) {
      lagging.push({ name: entry.name, pinned: bare(entry.version), latest: bare(latest) })
    }
  }

  const unknownManifests: string[] = []
  const currentProblems = findSetProblems(current, manifests, coreVersion, unknownManifests)
  const proposedProblems = findSetProblems(proposed, manifests, coreVersion, unknownManifests)

  return {
    lagging,
    unpinned,
    currentProblems,
    proposedProblems,
    proposed,
    unknownManifests: [...new Set(unknownManifests)],
  }
}

// True when nothing needs a human: no lag, no unpinned entry, both sets resolve, and
// every manifest that bore on the answer was actually read.
export function isPinCheckClean(plan: PinCheckPlan): boolean {
  return (
    plan.lagging.length === 0 &&
    plan.unpinned.length === 0 &&
    plan.currentProblems.length === 0 &&
    plan.proposedProblems.length === 0 &&
    plan.unknownManifests.length === 0
  )
}

// Human-readable report. Kept in the planner (not the network layer) so the wording is
// unit-testable and so a cron's log line and a developer's terminal say the same thing.
export function formatPinCheckReport(plan: PinCheckPlan): string {
  const lines: string[] = []

  if (plan.lagging.length > 0) {
    lines.push('Pins behind their latest release:')
    for (const lag of plan.lagging) {
      lines.push(`  ${lag.name}: pinned v${lag.pinned}, latest v${lag.latest}`)
    }
    lines.push('')
    lines.push('The pin is the build: these releases ship nothing until modules.json moves.')
  }

  if (plan.unpinned.length > 0) {
    lines.push('')
    lines.push(`Entries with no version pin (build takes default-branch HEAD): ${plan.unpinned.join(', ')}`)
  }

  if (plan.unknownManifests.length > 0) {
    lines.push('')
    lines.push(`Manifests that could not be read (dependency edges unresolved): ${plan.unknownManifests.join(', ')}`)
  }

  const describe = (problem: PinSetProblem): string[] => {
    const out: string[] = []
    for (const unmet of problem.unmetModules) {
      const has = unmet.reason === 'outdated' ? `set has v${unmet.installedVersion}` : 'not in the registry'
      out.push(`  ${problem.name} v${problem.version} needs ${unmet.name} >= v${unmet.minVersion} (${has})`)
    }
    if (problem.unmetCore) {
      out.push(
        `  ${problem.name} v${problem.version} needs core >= v${problem.unmetCore.required} (core is v${problem.unmetCore.coreVersion})`
      )
    }
    return out
  }

  if (plan.currentProblems.length > 0) {
    lines.push('')
    lines.push('The CURRENT pinned set does not resolve - the next build will fail:')
    for (const problem of plan.currentProblems) lines.push(...describe(problem))
  }

  if (plan.proposedProblems.length > 0) {
    lines.push('')
    lines.push('Moving every pin to its latest release would NOT resolve:')
    for (const problem of plan.proposedProblems) lines.push(...describe(problem))
    lines.push('')
    lines.push('Ship the dependency first (core release, or the module it requires), then bump.')
  }

  if (lines.length === 0) return 'Every module pin matches its latest release and the set resolves.'

  return lines.join('\n')
}
