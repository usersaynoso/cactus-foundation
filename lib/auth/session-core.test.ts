import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SESSION_IDLE_MS, SESSION_TOUCH_EVERY_MS } from '@/lib/auth/session-timing'

// The idle clock. Wrong in one direction, a busy admin is thrown out mid-afternoon;
// wrong in the other, a forgotten tab stays signed in for ever. Neither throws.

type Row = { id: string; expiresAt: Date; user: { suspendedAt: Date | null; role: object } }
let ROW: Row | null = null
const updateMany = vi.fn(async () => ({ count: 1 }))

vi.mock('@/lib/config/env', () => ({ getSessionSecret: () => 'test-secret' }))
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    session: {
      findUnique: async () => ROW,
      delete: async () => ({}),
      updateMany: (...args: unknown[]) => updateMany(...(args as [])),
    },
  },
}))

const { touchSession } = await import('@/lib/auth/session-core')

function rowExpiringIn(ms: number, suspended = false): Row {
  return {
    id: 's1',
    expiresAt: new Date(Date.now() + ms),
    user: { suspendedAt: suspended ? new Date() : null, role: {} },
  }
}

describe('touchSession', () => {
  beforeEach(() => {
    ROW = null
    updateMany.mockClear()
    updateMany.mockResolvedValue({ count: 1 })
  })

  it('refuses a token with no session behind it', async () => {
    expect(await touchSession('tok')).toBeNull()
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('refuses a session that has already run out', async () => {
    ROW = rowExpiringIn(-1000)
    expect(await touchSession('tok')).toBeNull()
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('refuses a suspended user', async () => {
    ROW = rowExpiringIn(60_000, true)
    expect(await touchSession('tok')).toBeNull()
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('leaves a recently moved session alone and hands back its expiry', async () => {
    ROW = rowExpiringIn(SESSION_IDLE_MS - 60_000)
    const result = await touchSession('tok')
    expect(result).toEqual(ROW.expiresAt)
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('restarts the full idle window once the throttle has passed', async () => {
    ROW = rowExpiringIn(SESSION_IDLE_MS - SESSION_TOUCH_EVERY_MS - 60_000)
    const before = Date.now()
    const result = await touchSession('tok')
    expect(result).not.toBeNull()
    expect(result!.getTime()).toBeGreaterThanOrEqual(before + SESSION_IDLE_MS)
    expect(updateMany).toHaveBeenCalledTimes(1)
  })

  it('keeps a nearly expired session going', async () => {
    ROW = rowExpiringIn(30_000)
    const result = await touchSession('tok')
    expect(result!.getTime() - Date.now()).toBeGreaterThan(SESSION_IDLE_MS - 1000)
  })

  it('does not bring back a session signed out between the read and the write', async () => {
    ROW = rowExpiringIn(30_000)
    updateMany.mockResolvedValue({ count: 0 })
    expect(await touchSession('tok')).toBeNull()
  })
})
