import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// The second step of password sign-in stands in for the second factor, never
// for the password. An authenticator code and a recovery code are not minted by
// the password step the way an emailed code is, so on their own they proved
// nothing about it: a member id (handed back by the password step, and not a
// secret) plus a code from the member's phone was a session. Both now need the
// challenge the password step leaves behind.

const state = vi.hoisted(() => ({
  liveChallenges: 0,
  cleared: 0,
  sessions: 0,
  recoveryCodeSpent: false,
}))

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    member: {
      findUnique: vi.fn(async () => ({
        id: 'm1',
        email: 'jo@example.com',
        status: 'ACTIVE',
        twoFactorConfigs: [
          { id: 'tf1', method: 'AUTHENTICATOR_APP', verified: true, secretEncrypted: 'enc', phoneEncrypted: null, lastStep: null },
        ],
      })),
    },
    memberEmailChallenge: {
      count: vi.fn(async () => state.liveChallenges),
      deleteMany: vi.fn(async () => {
        state.cleared++
        state.liveChallenges = 0
        return { count: 1 }
      }),
    },
    memberTwoFactor: { update: vi.fn(async () => ({})) },
  },
}))
vi.mock('@/lib/auth/totp', () => ({ verifyTotpCode: () => ({ valid: true, step: 1 }) }))
vi.mock('@/lib/crypto/secrets', () => ({ tryDecryptSecret: () => 'secret' }))
vi.mock('@/lib/members/registration', () => ({ loginRejectionForStatus: () => null }))
vi.mock('@/lib/members/session', () => ({
  createMemberSession: vi.fn(async () => {
    state.sessions++
    return 'tok'
  }),
  setMemberSessionCookie: vi.fn(async () => {}),
  createMemberTrustedBrowser: vi.fn(async () => 'trust'),
  setMemberTrustedBrowserCookie: vi.fn(async () => {}),
}))
vi.mock('@/lib/members/recovery-codes', () => ({
  consumeMemberRecoveryCode: vi.fn(async () => {
    state.recoveryCodeSpent = true
    return true
  }),
}))
vi.mock('@/lib/auth/rate-limit', () => ({
  checkAndRecord: async () => ({ allowed: true }),
  getClientIp: async () => '127.0.0.1',
}))
vi.mock('@/lib/members/config', () => ({ getMembersConfig: async () => ({}) }))
vi.mock('@/lib/members/sms-policy', () => ({ memberNeedsSmsEnrolment: async () => false }))
vi.mock('@/lib/members/activity', () => ({ recordMemberActivity: vi.fn(async () => {}) }))
vi.mock('@/lib/members/security-alerts', () => ({ notifyMemberSecurityAlert: vi.fn(async () => {}) }))
vi.mock('@/lib/config/env', () => ({ isEmailConfigured: () => true }))

import { POST as verifyTwoFactor } from '@/app/api/members/auth/2fa/verify/route'
import { POST as useRecoveryCode } from '@/app/api/members/auth/recovery-code/consume/route'

const post = (handler: (r: NextRequest) => Promise<Response>, body: unknown) =>
  handler(new NextRequest('http://localhost/x', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => {
  state.liveChallenges = 0
  state.cleared = 0
  state.sessions = 0
  state.recoveryCodeSpent = false
})

describe('authenticator code', () => {
  it('signs nobody in without the password step behind it', async () => {
    const res = await post(verifyTwoFactor, { memberId: 'm1', code: '123456' })
    expect(res.status).toBe(401)
    expect(state.sessions).toBe(0)
  })

  it('signs in after the password step, and spends that step', async () => {
    state.liveChallenges = 1
    const res = await post(verifyTwoFactor, { memberId: 'm1', code: '123456' })
    expect(res.status).toBe(200)
    expect(state.sessions).toBe(1)
    expect(state.cleared).toBe(1)
  })
})

describe('recovery code', () => {
  it('signs nobody in without the password step behind it, and costs no code', async () => {
    const res = await post(useRecoveryCode, { memberId: 'm1', code: 'abcdef-123456' })
    expect(res.status).toBe(401)
    expect(state.sessions).toBe(0)
    expect(state.recoveryCodeSpent).toBe(false)
  })

  it('signs in after the password step, and spends that step', async () => {
    state.liveChallenges = 1
    const res = await post(useRecoveryCode, { memberId: 'm1', code: 'abcdef-123456' })
    expect(res.status).toBe(200)
    expect(state.sessions).toBe(1)
    expect(state.cleared).toBe(1)
  })
})
