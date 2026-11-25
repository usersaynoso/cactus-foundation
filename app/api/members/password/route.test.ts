import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// A first password on a member account is a new, durable way in, so it needs a
// recent sign-in like a passkey does; guesses at the current password are counted.

const state = vi.hoisted(() => ({
  existing: null as null | { hash: string },
  fresh: true,
  allowed: true,
  upserts: 0,
  checked: [] as string[][],
}))

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    memberPassword: {
      findUnique: vi.fn(async () => state.existing),
      upsert: vi.fn(async () => {
        state.upserts++
        return {}
      }),
    },
    memberTwoFactor: { findFirst: vi.fn(async () => null) },
  },
}))
vi.mock('@/lib/members/session', () => ({
  getMemberFromCookie: vi.fn(async () => ({ id: 'm1', email: 'jo@example.com' })),
  isCurrentMemberSessionFresh: vi.fn(async () => state.fresh),
  deleteAllMemberSessions: vi.fn(async () => {}),
  getCurrentMemberSessionTokenHash: vi.fn(async () => 'h'),
  revokeAllMemberTrustedBrowsers: vi.fn(async () => {}),
}))
vi.mock('@/lib/auth/password', () => ({
  hashPassword: vi.fn(async () => 'newhash'),
  verifyPassword: vi.fn(async (p: string) => p === 'right'),
  validateNewPassword: vi.fn(async () => ({ valid: true })),
}))
vi.mock('@/lib/auth/rate-limit', () => ({
  checkAndRecord: vi.fn(async (_a: string, ids: string[]) => {
    state.checked.push(ids)
    return { allowed: state.allowed }
  }),
}))
vi.mock('@/lib/members/config', () => ({
  getMembersConfig: vi.fn(async () => ({})),
  isAuthMethodEnabled: () => true,
  isAuthMethodRequired: () => false,
}))
vi.mock('@/lib/members/security-alerts', () => ({ notifyMemberSecurityAlert: vi.fn(async () => {}) }))
vi.mock('@/lib/config/env', () => ({ isEmailConfigured: () => true }))

import { POST } from './route'

function req(body: unknown) {
  return new NextRequest('http://localhost/api/members/password', { method: 'POST', body: JSON.stringify(body) })
}

describe('POST /api/members/password', () => {
  beforeEach(() => {
    state.existing = null
    state.fresh = true
    state.allowed = true
    state.upserts = 0
    state.checked = []
  })

  it('refuses a first password on a stale session with reauthRequired', async () => {
    state.fresh = false
    const res = await POST(req({ newPassword: 'x' }))
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ reauthRequired: true })
    expect(state.upserts).toBe(0)
  })

  it('allows a first password on a fresh session', async () => {
    const res = await POST(req({ newPassword: 'x' }))
    expect(res.status).toBe(200)
    expect(state.upserts).toBe(1)
  })

  it('counts and refuses current-password guesses once the limit is hit', async () => {
    state.existing = { hash: 'old' }
    state.allowed = false
    const res = await POST(req({ currentPassword: 'wrong', newPassword: 'x' }))
    expect(res.status).toBe(429)
    expect(state.checked).toEqual([['member:m1']])
    expect(state.upserts).toBe(0)
  })

  it('changes the password for a stale session when the current one is right', async () => {
    state.existing = { hash: 'old' }
    state.fresh = false
    const res = await POST(req({ currentPassword: 'right', newPassword: 'x' }))
    expect(res.status).toBe(200)
  })
})
