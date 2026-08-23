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
// The deploy lock is a singleton, so in practice only one module is ever 'deploying'
// at a time; we still operate on the whole set to match the webhook's batch semantics.

// Promote modules whose deployment succeeded: the in-flight pendingVersion becomes
// the confirmed installed version. `pendingVersion ?? version` leaves install flows
// (which never set pendingVersion) on the version they shipped with.
export async function markModulesDeploySucceeded(): Promise<void> {
  const deploying = await prisma.module.findMany({ where: { status: 'deploying' } })
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
// and drop the in-flight target. A module that was mid-update (updateAvailable set)
// reverts cleanly to 'update_available' so the admin can simply retry - the failure
// reason was already surfaced by the deploy status bar, so we don't leave a stale
// error on the row. A failed install (no updateAvailable) becomes 'failed' with the
// reason, since there is no prior version to fall back to.
export async function markModulesDeployFailed(reason: string): Promise<void> {
  const deploying = await prisma.module.findMany({ where: { status: 'deploying' } })
  await Promise.all(
    deploying.map((m) =>
      prisma.module.update({
        where: { id: m.id },
        data: m.updateAvailable
          ? { status: 'update_available', pendingVersion: null, lastError: null }
          : { status: 'failed', pendingVersion: null, lastError: reason },
      })
    )
  )
}
