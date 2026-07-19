import type { $Enums, Prisma } from '@prisma/client'

// Which modules are LIVE on this site, for every feature that renders something a
// module contributes: gallery media, detail slots, member extensions, layout types,
// SMS providers, admin nav.
//
// The bug this exists to prevent: `status` conflates two different questions, and
// filtering on `['active', 'update_available']` answers the wrong one.
//
//   "Is this module installed on this site?"   - a database fact
//   "Is this module's code in this build?"     - a build fact
//
// Updating a module moves it to `deploying` (and, when there is no deploy to track,
// on to `pending_deploy`) for the duration. Its code is still perfectly live in the
// running build the whole time - nothing has been removed - but a status filter that
// omits those two treated it as uninstalled, so every feature it contributed silently
// vanished from the public site mid-deploy. A `pending_deploy` module stays there
// until someone triggers the deferred deploy, so the outage was open-ended rather
// than lasting a build.
//
// The fix is to let this constant answer only the database question. The build
// question is already answered at every call site, and answered better: each one
// looks its module up in a generated registry (moduleExtensionPointComponents,
// moduleSmsProviders, moduleLayoutTypeGroups, ...) and skips anything absent. A
// module being installed for the FIRST time is in `deploying` with no code in the
// build yet, so it matches here and is then dropped by that registry lookup - which
// is exactly the behaviour the old status filter was reaching for by hand.
//
// The corollary, and it is load-bearing: only use this where a generated registry
// (or MODULES_IN_BUILD) does the second half of the check. Somewhere that reads
// nav entries or routes straight off the stored manifest needs its own build-fact
// gate, or a first install will advertise pages that 404 until the deploy lands.
export const INSTALLED_MODULE_STATUSES = [
  'active',
  'update_available',
  'deploying',
  'pending_deploy',
] as const satisfies readonly $Enums.ModuleStatus[]

/** Installed on this site. Says nothing about whether the code is in this build. */
export const INSTALLED_MODULE_WHERE = {
  status: { in: [...INSTALLED_MODULE_STATUSES] },
} satisfies Prisma.ModuleWhereInput
