import { describe, it, expect } from 'vitest'
import {
  isLockExpired,
  secondsUntilLockClears,
  lockBusyMessage,
  DEFAULT_LOCK_HOLD_MS,
  STALE_LOCK_MS,
  type DeployLockRow,
} from './lock'

// A lock is released by the handler that took it. A function hard-killed mid-push (the
// 60s ceiling, or OOM) runs no release path at all, so the only thing that frees the lock
// is it going stale - which is why "how stale is stale" is the whole story here. Before
// expiresAt existed that answer was a flat 15 minutes, and a failed update locked the
// owner out for a quarter of an hour every time GitHub had a wobble.

const lock = (over: Partial<DeployLockRow> = {}): DeployLockRow => ({
  id: 'singleton',
  lockedAt: new Date(),
  lockedBy: 'cactus-core-update',
  expiresAt: new Date(Date.now() + DEFAULT_LOCK_HOLD_MS),
  ...over,
})

describe('deploy lock expiry', () => {
  it('holds while a live run is still inside its stamped window', () => {
    expect(isLockExpired(lock())).toBe(false)
  })

  it('frees a stranded lock shortly after its stamped window, not 15 minutes later', () => {
    const strandedAt = Date.now() - (DEFAULT_LOCK_HOLD_MS + 1_000)
    const dead = lock({
      lockedAt: new Date(strandedAt),
      expiresAt: new Date(strandedAt + DEFAULT_LOCK_HOLD_MS),
    })
    expect(isLockExpired(dead)).toBe(true)
    // The old blanket rule would still have been holding it at this point.
    expect(DEFAULT_LOCK_HOLD_MS).toBeLessThan(STALE_LOCK_MS)
  })

  it('falls back to the 15-minute rule for a row written before expiresAt existed', () => {
    const legacy = lock({ expiresAt: null, lockedAt: new Date(Date.now() - 60_000) })
    expect(isLockExpired(legacy)).toBe(false)
    const ancient = lock({ expiresAt: null, lockedAt: new Date(Date.now() - (STALE_LOCK_MS + 1_000)) })
    expect(isLockExpired(ancient)).toBe(true)
  })

  it('tells the owner how long the wait is, in seconds for a normal hold', () => {
    const secs = secondsUntilLockClears(lock())
    expect(secs).toBeGreaterThan(0)
    expect(secs).toBeLessThanOrEqual(DEFAULT_LOCK_HOLD_MS / 1000)
    expect(lockBusyMessage(lock())).toMatch(/about \d+ seconds/)
  })

  it('switches to minutes for a legacy row with a long wait left', () => {
    const legacy = lock({ expiresAt: null, lockedAt: new Date() })
    expect(lockBusyMessage(legacy)).toMatch(/about \d+ minutes/)
  })

  it('never counts down past zero', () => {
    const dead = lock({ expiresAt: new Date(Date.now() - 60_000) })
    expect(secondsUntilLockClears(dead)).toBe(1)
  })
})
