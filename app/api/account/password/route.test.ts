import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({
  hash: null as string | null,
  fresh: true,
  allowed: true,
  updates: 0,
  checked: [] as string[][],
}))

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: () => ({ value: 't' }) })) }))
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => ({ passwordHash: state.hash, email: 'a@example.com' })),
      update: vi.fn(async () => {
        state.updates++
        return {}
      }),
    },
    siteConfig: { findUnique: vi.fn(async () => ({ siteName: 'Site' })) },
  },
}))
vi.mock('@/lib/auth/session', () => ({
  getSessionFromCookie: vi.fn(async () => ({ id: 'u1', passwordHash: state.hash })),
  isCurrentSessionFresh: vi.fn(async () => state.fresh),
  deleteAllUserSessions: vi.fn(async () => {}),
  revokeAllTrustedDevices: vi.fn(async () => {}),
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
vi.mock('@/lib/email/index', () => ({ sendPasswordChangedNotification: vi.fn(async () => {}) }))
vi.mock('@/lib/config/env', () => ({ isEmailConfigured: () => true, getSessionSecret: () => 's' }))

import { POST } from './route'

function req(body: unknown) {
  return new NextRequest('http://localhost/api/account/password', { method: 'POST', body: JSON.stringify(body) })
}

describe('POST /api/account/password', () => {
  beforeEach(() => {
    state.hash = null
    state.fresh = true
    state.allowed = true
    state.updates = 0
    state.checked = []
  })

  it('refuses a first password on a stale session with reauthRequired', async () => {
    state.fresh = false
    const res = await POST(req({ newPassword: 'x' }))
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ reauthRequired: true })
    expect(state.updates).toBe(0)
  })

  it('allows a first password on a fresh session', async () => {
    const res = await POST(req({ newPassword: 'x' }))
    expect(res.status).toBe(200)
    expect(state.updates).toBe(1)
  })

  it('rate-limits current-password guesses', async () => {
    state.hash = 'old'
    state.allowed = false
    const res = await POST(req({ currentPassword: 'wrong', newPassword: 'x' }))
    expect(res.status).toBe(429)
    expect(state.checked).toEqual([['account:u1']])
    expect(state.updates).toBe(0)
  })

  it('still changes a password on a stale session with the right current one', async () => {
    state.hash = 'old'
    state.fresh = false
    const res = await POST(req({ currentPassword: 'right', newPassword: 'x' }))
    expect(res.status).toBe(200)
  })
})
