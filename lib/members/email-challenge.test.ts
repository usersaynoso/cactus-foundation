import { createHash, createHmac } from 'crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Member challenge codes are six digits, so a plain sha256 of one is reversed
// in about a second by anyone who can read the table. They are keyed with
// SESSION_SECRET instead, in the one place that hashes them.

const rows = vi.hoisted(() => ({ stored: null as null | Record<string, unknown> }))

vi.mock('@/lib/config/env', () => ({ getSessionSecret: () => 'test-secret' }))
vi.mock('@/lib/auth/session', () => ({
  safeCompare: (a: string, b: string) => a === b,
}))
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    memberEmailChallenge: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        rows.stored = { id: 'c1', attempts: 0, createdAt: new Date(), ...data }
        return rows.stored
      }),
      findFirst: vi.fn(async () => rows.stored),
      update: vi.fn(async () => ({})),
      delete: vi.fn(async () => ({})),
    },
  },
}))

import { createMemberEmailChallenge, verifyMemberEmailChallenge } from './email-challenge'

describe('member email challenge hashing', () => {
  beforeEach(() => {
    rows.stored = null
  })

  it('stores an HMAC keyed with the session secret, not a bare sha256', async () => {
    const code = await createMemberEmailChallenge('m1', 'login_2fa')
    const stored = rows.stored?.codeHash
    expect(stored).toBe(createHmac('sha256', 'test-secret').update(code).digest('hex'))
    expect(stored).not.toBe(createHash('sha256').update(code).digest('hex'))
  })

  it('verifies the right code and refuses a code matching a legacy plain hash', async () => {
    const code = await createMemberEmailChallenge('m1', 'login_2fa')
    expect(await verifyMemberEmailChallenge('m1', 'login_2fa', ` ${code} `)).toMatchObject({ success: true })

    rows.stored = {
      id: 'c2',
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
      pendingEmail: null,
      codeHash: createHash('sha256').update('123456').digest('hex'),
    }
    expect(await verifyMemberEmailChallenge('m1', 'login_2fa', '123456')).toEqual({ success: false, reason: 'invalid' })
  })
})
