// Pure planner: never let a modules.json write move a module pin BACKWARDS.
//
// modules.json is not edited, it is regenerated wholesale from the Module table on two
// paths - the core update (app/api/admin/updates/route.ts, which hands the list to
// syncCoreFromUpstream so the pins land in the same commit as the core sync) and any
// registry-syncing redeploy (lib/deploy/redeploy.ts -> syncModulesJson). Treating the
// database as the source of truth is right in the normal case and quietly wrong in one:
// a pin moved in git that the database never learned about is silently undone by the
// next unrelated core update, and the build goes back to the tag that was broken enough
// to need moving in the first place.
//
// That is not hypothetical. On 2026-07-28 shop-variations v0.1.94 shipped without a file
// its own importer imports, so every build failed; the pin was moved to v0.1.95 in git,
// the site then took a routine core update, and modules.json came back pinned to v0.1.94
// with the same build failure and nothing in the log to say a pin had been lowered.
//
// Nothing in the product deliberately installs an OLDER module: every version written to
// the Module table comes from a release lookup (getLatestRelease), so a desired version
// below the pinned one is drift, not intent. The higher one wins and the difference is
// reported - loudly, because a held pin means the database is now behind what the site
// actually builds, and the Modules page will say so until an update reconciles it.
//
// Deliberately IO-free so it can be unit-tested without GitHub. The callers do the
// reading and the logging.

import { compareVersions } from '@/lib/updates/version'

export interface PinnedModule {
  name: string
  repoUrl: string
  version: string
  // A tag this site has actually watched fail to build (Module.lastFailedVersion).
  // The floor does not apply against it - see applyPinFloor.
  lastFailedVersion?: string | null
}

// An entry as it appears in the repo's modules.json today. `version` is optional
// because an unpinned entry is a real (if unwanted) state - see pin-check.ts.
export interface RegistryPin {
  name: string
  version?: string
}

export interface HeldPin {
  name: string
  // What the database asked for.
  wanted: string
  // What git is already pinned to, and stays pinned to.
  kept: string
}

export interface PinFloorResult {
  entries: PinnedModule[]
  held: HeldPin[]
}

// `desired` is the full list the caller intends to write; `pinned` is what modules.json
// holds now. Entries absent from `desired` stay absent: an uninstalled or deliberately
// excluded module must still be removable, so this only ever raises a version, never
// resurrects an entry.
//
// The one exception to the floor is a pin this site has watched fail to build
// (`lastFailedVersion`). The floor's whole premise is that a higher pin is a better
// pin - someone moved it forward in git for a reason the database never heard about.
// A tag whose build we watched fail is the case where that premise is false, and
// holding it is not caution but a wedge: modules.json is committed before the build
// runs, so a failed update leaves the repo pinned to code that cannot build, and every
// later deploy of anything keeps it and fails the same way. The site could not deploy
// at all until the module's author published a higher version.
//
// Narrow deliberately. Only a version equal to the one recorded as failed is lowered
// past, and only for the module that recorded it. Any other backwards move is still
// drift, and still held.
export function applyPinFloor(desired: PinnedModule[], pinned: RegistryPin[]): PinFloorResult {
  const pinnedByName = new Map<string, RegistryPin>()
  for (const entry of pinned) pinnedByName.set(entry.name, entry)

  const held: HeldPin[] = []
  const entries = desired.map((module) => {
    const current = pinnedByName.get(module.name)?.version
    if (!current || compareVersions(current, module.version) <= 0) return module

    if (module.lastFailedVersion && compareVersions(current, module.lastFailedVersion) === 0) {
      // The pin in git IS the build we watched fail. Lower it back to the version
      // the database still considers installed, which is the last one that built.
      return module
    }

    held.push({ name: module.name, wanted: module.version, kept: current })
    return { ...module, version: current }
  })

  return { entries, held }
}

// One line per held pin, for the server log. Says what to do about it, because the
// state it describes (database behind git) is only cleared by updating the module.
export function formatHeldPins(held: HeldPin[]): string {
  const lines = held.map(
    (pin) => `  ${pin.name}: kept ${pin.kept}, ignored request to pin ${pin.wanted}`
  )
  return [
    'Module registry write would have moved pins backwards - they were held instead:',
    ...lines,
    'The build keeps the newer tag. Update the module(s) so the database agrees.',
  ].join('\n')
}
