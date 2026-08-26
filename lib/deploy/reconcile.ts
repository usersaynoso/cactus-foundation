import { prisma } from '@/lib/db/prisma'
import { clearAlert } from '@/lib/notifications/alerts'
import { declaredLayoutTypesByModule, isModuleInBuild, seedModuleDefaultLayouts } from '@/lib/setup/starterLayouts'
import { autoPlaceModuleBlocks } from '@/lib/layout/auto-place-blocks'

// Reconciles modules left in 'deploying' once the Vercel build reaches a terminal
// state. Centralised so every "deploy finished" path (the Pro-plan webhook, the
// Hobby-plan check-status poll, and the redeploying-screen dismiss) agrees on what
// success and failure mean - in particular, that the confirmed `version` only moves
// to the in-flight `pendingVersion` when the deploy actually succeeds.
//
// These operate on the whole 'deploying' set, which is right for a bulk "update all"
// (one build carries every queued module) and load-bearing for the guarantee that
// keeps it honest: every module in that set must belong to the SAME build.
//
// The deploy lock does not provide that guarantee, whatever it looks like. It is
// released before the build it triggers even starts, so a second update inside the
// build window used to queue its own modules into 'deploying' alongside the first
// batch - and then the first build landing promoted the lot, recording modules as
// installed off a build whose code never contained them. lib/deploy/in-flight.ts is
// what actually holds the line now: no install, update or uninstall may start while
// a build is running.

// The modules a given deployment outcome is entitled to reconcile.
//
// Callers that know which deployment finished pass its id, and then only modules
// riding on that deployment are touched. Module.deployId carries 'pending' until
// startDeferredRedeploy resolves the real id, and those match too - the id was not
// knowable when the row was queued, and the build is still ours.
//
// Passing nothing keeps the old behaviour of reconciling everything in 'deploying'.
// That is still right for a caller with no id to offer (the owner dismissing the
// status bar on a deploy nobody can name), and wrong to rely on anywhere else: the
// reason this argument exists is that "whatever finished most recently on this
// Vercel project" was being taken as an answer about our modules, and a stranger's
// build could promote a pendingVersion whose code was never deployed.
async function deployingModulesFor(deploymentId?: string | null) {
  const deploying = await prisma.module.findMany({ where: { status: 'deploying' } })
  if (!deploymentId) return deploying
  return deploying.filter((m) => !m.deployId || m.deployId === 'pending' || m.deployId === deploymentId)
}

// Promote modules whose deployment succeeded: the in-flight pendingVersion becomes
// the confirmed installed version. `pendingVersion ?? version` leaves install flows
// (which never set pendingVersion) on the version they shipped with.
export async function markModulesDeploySucceeded(deploymentId?: string | null): Promise<void> {
  const deploying = await deployingModulesFor(deploymentId)
  await Promise.all(
    deploying.map(async (m) => {
      await prisma.module.update({
        where: { id: m.id },
        data: {
          status: 'active',
          version: m.pendingVersion ?? m.version,
          pendingVersion: null,
          updateAvailable: null,
          updateNotes: null,
          lastError: null,
          // This module just built. Whatever failed before is history, and leaving
          // it would let pin-floor lower a pin it has no business lowering.
          lastFailedVersion: null,
          deployId: null,
        },
      })
      // Seed the module's default layouts, now that a deploy carrying its code has
      // landed - its starter templates do not exist to copy any earlier. Guarded by
      // layoutsSeededAt rather than by the create-only upsert: an *update* comes back
      // through this same path, and would otherwise re-mint layouts the owner has
      // since deleted.
      //
      // isModuleInBuild is the second guard, and the load-bearing one. This reconcile
      // is not necessarily running on the deploy it is reconciling: the webhook or
      // status poll is served by whichever instance is live, routinely the previous
      // build, which has no copy of the module's templates. Seeding there writes
      // nothing, and stamping it would turn "seed once" into "never" - which is
      // exactly how a live Shop ended up 404ing every product URL. Left unstamped,
      // seedPendingModuleLayouts() picks it up on the next request served by a build
      // that does have the code.
      //
      // The stamp goes on only when the seed actually wrote something, or when the
      // module has no layout types to write. A run that creates nothing yet stamps
      // anyway is the whole gazette fault in one line: six starters, no flags, zero
      // rows, door shut for good. `seedPendingModuleLayouts()` would now dig such a
      // module back out on a later request, but there is no sense manufacturing the
      // hole first.
      if (!m.layoutsSeededAt && isModuleInBuild(m.name)) {
        try {
          const created = await seedModuleDefaultLayouts(prisma, m.name)
          // Marker blocks the module asked core to place for it. Inside this
          // `layoutsSeededAt` guard deliberately: the stamp is what makes it
          // first-install-only, and re-adding a block the owner has since
          // deleted would be core editing their site behind their back.
          await autoPlaceModuleBlocks(prisma, m.name)
          if (created > 0 || !declaredLayoutTypesByModule()[m.name]?.length) {
            await prisma.module.update({
              where: { id: m.id },
              data: { layoutsSeededAt: new Date() },
            })
          }
        } catch (err) {
          // Left unstamped, so the next deploy tries again. The module is active either
          // way - a missing default layout is a blank page, not a broken site.
          console.error(`[reconcile] Failed to seed default layouts for ${m.name}:`, err)
        }
      }

      // The update is live - clear the "update available" reminder for this module.
      try {
        await clearAlert(`module-update:${m.id}`)
      } catch (err) {
        console.error('[reconcile] Failed to clear module-update notification:', err)
      }
    })
  )
}

// Roll back modules whose deployment failed: keep the confirmed (still-live) version
// and drop the in-flight target. A module that was mid-update reverts cleanly to
// 'update_available' so the admin can simply retry - the failure reason was already
// surfaced by the deploy status bar, so we don't leave a stale error on the row. A
// failed install becomes 'failed' with the reason, since there is no prior version
// to fall back to.
//
// The two are told apart by pendingVersion, which is set by every update path and
// by no install path. It used to be updateAvailable, which cannot work: all three
// update routes null updateAvailable at the moment they queue the module, so by the
// time this runs it is ALWAYS null and every failed update was recorded as a failed
// install. That is not a cosmetic mislabel. 'failed' is one of the two statuses
// lib/deploy/redeploy.ts excludes from modules.json, so the next successful build
// stopped checking the module out at all - and run-module-migrations.mjs skips it
// too. A module that was working perfectly, whose update merely failed to build,
// silently vanished from the site on the following deploy.
export async function markModulesDeployFailed(reason: string, deploymentId?: string | null): Promise<void> {
  const deploying = await deployingModulesFor(deploymentId)
  await Promise.all(
    deploying.map((m) =>
      prisma.module.update({
        where: { id: m.id },
        data: m.pendingVersion
          ? {
              status: 'update_available',
              // Put back what queueing this update cleared, or the row returns to
              // the Updates tab with nothing to offer: the card renders "Update to"
              // with an empty version and the badge disappears.
              updateAvailable: m.pendingVersion,
              // Remember which tag it was. modules.json was committed pinning it
              // before this build ran, and pin-floor will not lower a pin without
              // being told the higher one is the broken one - see pin-floor.ts.
              lastFailedVersion: m.pendingVersion,
              pendingVersion: null,
              deployId: null,
              lastError: null,
            }
          : { status: 'failed', pendingVersion: null, deployId: null, lastError: reason },
      })
    )
  )
}
