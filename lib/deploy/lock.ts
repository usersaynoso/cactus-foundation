import { prisma } from '@/lib/db/prisma'

// A deploy lock older than this is treated as orphaned. The lock is normally
// released either by the handler that acquired it (on success or in its catch),
// by the Vercel deploy webhook, or by the redeploy-status handler. But a function
// that acquires the lock and is then hard-killed (Vercel function timeout / OOM)
// runs none of those, so the lock is stranded forever and every subsequent
// install / update / core-update returns a permanent 409 "install in progress".
//
// 15 minutes comfortably exceeds the longest legitimate hold - a 60s route plus
// the Vercel build it triggers - so a lock older than this is certainly abandoned.
export const STALE_LOCK_MS = 15 * 60 * 1000

// Returns the live deploy lock, or null when none is held. A lock whose lockedAt
// is older than STALE_LOCK_MS is treated as orphaned: it is deleted and null is
// returned, so a stranded lock self-heals on the next attempt instead of blocking
// installs/updates indefinitely.
//
// The delete is scoped to the exact stale row (id + lockedAt) so a fresh lock that
// another request acquires in the tiny window between this read and the delete is
// never removed by mistake.
export async function getActiveDeployLock() {
  const lock = await prisma.deployLock.findUnique({ where: { id: 'singleton' } })
  if (!lock) return null

  if (Date.now() - lock.lockedAt.getTime() > STALE_LOCK_MS) {
    await prisma.deployLock.deleteMany({
      where: { id: 'singleton', lockedAt: lock.lockedAt },
    })
    return null
  }

  return lock
}
