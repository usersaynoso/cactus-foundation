import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// A trusted browser on the staff sign-in skips the emailed code. It must not
// skip the password: the code step takes the account id straight from the
// request body, so without the challenge the password step leaves behind, a
// trusted-browser cookie and an id were a session.

const state = vi.hoisted(() => ({ liveChallenge: false, sessions: 0 }))

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => ({ id: 'u1', email: 'owner@example.com', suspendedAt: null })) },
    siteConfig: { findUnique: vi.fn(async () => ({ trustDeviceDays: 28 })) },
    emailChallenge: {
      deleteMany: vi.fn(async () => {
        const count = state.liveChallenge ? 1 : 0
        state.liveChallenge = false
        return { count }
      }),
    },
  },
}))
vi.mock('@/lib/config/env', () => ({ getSessionSecret: () => 'test-secret' }))
vi.mock('@/lib/auth/session', () => ({
  isTrustedDevice: async () => true,
  createSession: vi.fn(async () => {
    state.sessions++
    return 'tok'
  }),
  setSessionCookie: vi.fn(async () => {}),
  createTrustedDevice: vi.fn(async () => 'trust'),
  setTrustedDeviceCookie: vi.fn(async () => {}),
  safeCompare: (a: string, b: string) => a === b,
}))
vi.mock('@/lib/auth/rate-limit', () => ({
  checkAndRecord: async () => ({ allowed: true }),
  getClientIp: async () => '127.0.0.1',
}))
vi.mock('@/lib/auth/sign-in-alerts', () => ({ noteSuccessfulSignIn: vi.fn(async () => {}) }))

import { POST } from '@/app/api/auth/email-code/route'

const submit = () =>
  POST(new NextRequest('http://localhost/api/auth/email-code', {
    method: 'POST',
    body: JSON.stringify({ userId: 'u1', code: '000000' }),
  }))

beforeEach(() => {
  state.liveChallenge = false
  state.sessions = 0
})

describe('trusted browser on the staff code step', () => {
  it('signs nobody in when the password step never happened', async () => {
    expect((await submit()).status).toBe(401)
    expect(state.sessions).toBe(0)
  })

  it('skips the code once the password has been checked, and only once', async () => {
    state.liveChallenge = true
    expect((await submit()).status).toBe(200)
    expect((await submit()).status).toBe(401)
    expect(state.sessions).toBe(1)
  })
})
