import { prisma } from '@/lib/db/prisma'

// A deploy lock older than this is treated as orphaned. The lock is normally
// released either by the handler that acquired it (on success or in its catch),
// by the Vercel deploy webhook, or by the redeploy-status handler. But a function
// that acquires the lock and is then hard-killed (Vercel function timeout / OOM)
// runs none of those, so the lock is stranded forever and every subsequent
// install / update / core-update returns a permanent 409 "install in progress".
//
// This is the FALLBACK sweep only, for rows written before expiresAt existed (or by
// a caller that didn't stamp one). Anything acquired through acquireDeployLock below
// carries its own expiry and frees far sooner - 15 minutes of being locked out after
// a failure that took 60 seconds is a miserable wait when GitHub is having a bad day.
export const STALE_LOCK_MS = 15 * 60 * 1000

// Default credible hold for a lock taken inside a request handler. Every route that
// takes the lock releases it before returning (the Vercel build it triggers runs
// unlocked), and all of them cap at maxDuration = 60, so a hold can't legitimately
// outlive the function. 90s leaves headroom for clock skew between the app and the
// database without leaving a dead lock sitting there for minutes.
export const DEFAULT_LOCK_HOLD_MS = 90 * 1000

export type DeployLockRow = {
  id: string
  lockedAt: Date
  lockedBy: string
  expiresAt: Date | null
}

// Returns the live deploy lock, or null when none is held. A lock that has passed its
// own expiresAt - or, for a row with no expiry, whose lockedAt is older than
// STALE_LOCK_MS - is treated as orphaned: it is deleted and null is returned, so a
// stranded lock self-heals on the next attempt instead of blocking installs/updates.
//
// The delete is scoped to the exact stale row (id + lockedAt) so a fresh lock that
// another request acquires in the tiny window between this read and the delete is
// never removed by mistake.
export function isLockExpired(lock: DeployLockRow, now: number = Date.now()): boolean {
  return lock.expiresAt
    ? now > lock.expiresAt.getTime()
    : now - lock.lockedAt.getTime() > STALE_LOCK_MS
}

export async function getActiveDeployLock(): Promise<DeployLockRow | null> {
  const lock = await prisma.deployLock.findUnique({ where: { id: 'singleton' } })
  if (!lock) return null

  if (isLockExpired(lock)) {
    await prisma.deployLock.deleteMany({
      where: { id: 'singleton', lockedAt: lock.lockedAt },
    })
    return null
  }

  return lock
}

// Takes the lock, stamping how long this holder's work can credibly run. Callers
// that hold it for something other than a single 60s request pass their own holdMs.
//
// Returns false when someone else got there first. The row is a singleton, so two
// requests that both pass getActiveDeployLock() and then both write here mean the
// second hits a unique-constraint violation. Losing that race is the correct
// outcome and callers must answer 409 - but an uncaught Prisma error is not a 409,
// it is a 500 with a stack trace, from a route whose whole job is to be careful.
export async function acquireDeployLock(
  lockedBy: string,
  holdMs: number = DEFAULT_LOCK_HOLD_MS
): Promise<boolean> {
  try {
    await prisma.deployLock.create({
      data: {
        id: 'singleton',
        lockedBy,
        expiresAt: new Date(Date.now() + holdMs),
      },
    })
    return true
  } catch (err) {
    // Only a unique-constraint violation means "someone else holds it". Anything
    // else - the database refusing connections, most likely - is not a race, and
    // reporting it as one would answer a broken database with a cheerful "try
    // again in a moment" while the real failure goes unlogged.
    if ((err as { code?: string })?.code === 'P2002') return false
    throw err
  }
}

// The 409 for losing that race. Deliberately the same shape of answer as
// lockBusyMessage, because from the owner's side it is the same situation.
export const LOCK_RACE_MESSAGE =
  'Another install or update started a moment before this one. Wait for it to finish, then try again.'

// Whole seconds until a held lock frees itself, floored at 1 so the message never
// reads "try again in 0 seconds".
export function secondsUntilLockClears(lock: DeployLockRow): number {
  const freesAt = lock.expiresAt
    ? lock.expiresAt.getTime()
    : lock.lockedAt.getTime() + STALE_LOCK_MS
  return Math.max(1, Math.ceil((freesAt - Date.now()) / 1000))
}

// The 409 an install/update gets when something else holds the lock. Says how long the
// wait is, because the usual reason for seeing this twice is a previous attempt that
// died rather than one genuinely still running - and "please wait" with no number reads
// as "wait indefinitely".
export function lockBusyMessage(lock: DeployLockRow): string {
  const secs = secondsUntilLockClears(lock)
  const wait = secs > 90 ? `about ${Math.ceil(secs / 60)} minutes` : `about ${secs} seconds`
  return `Another install or update is in progress. If that one failed, this clears itself in ${wait} - try again then.`
}
