import { prisma } from '@/lib/db/prisma'
import { clearAlert } from '@/lib/notifications/alerts'

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
