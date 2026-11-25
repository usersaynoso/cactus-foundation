import { afterEach, describe, expect, it, vi } from 'vitest'

// Member passkey registration accepts the site's own origin, plus exactly the
// Android apps the site vouches for in ANDROID_WEBCREDENTIAL_APPS (a passkey
// made through Credential Manager reports the app's signing-key hash as its
// origin). The RP ID never changes.

const seen = vi.hoisted(() => ({ opts: null as null | Record<string, unknown> }))

vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
  verifyRegistrationResponse: vi.fn(async (opts: Record<string, unknown>) => {
    seen.opts = opts
    return { verified: true, registrationInfo: {} }
  }),
}))
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    webAuthnChallenge: {
      findUnique: vi.fn(async () => ({ purpose: 'member_registration', expiresAt: new Date(Date.now() + 60_000), memberId: 'm1' })),
      delete: vi.fn(async () => ({})),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  },
}))
vi.mock('@/lib/config/env', () => ({
  getWebAuthnOrigin: () => 'https://example.test',
  getWebAuthnRpId: () => 'example.test',
}))
vi.mock('@/lib/members/admin-passkey-link', () => ({ verifyLinkedAdminPasskey: vi.fn() }))

import { memberRegistrationOrigins, verifyMemberRegistration } from '@/lib/members/passkey'
import { androidApkKeyHashOrigin } from '@/lib/auth/android-webcredentials'

const FP = Array.from({ length: 32 }, () => '1F').join(':')

afterEach(() => {
  delete process.env.ANDROID_WEBCREDENTIAL_APPS
})

describe('member passkey registration origins', () => {
  it('is the site alone when no Android app is configured', async () => {
    expect(memberRegistrationOrigins()).toEqual(['https://example.test'])
    await verifyMemberRegistration('chal', {} as never)
    expect(seen.opts).toMatchObject({ expectedOrigin: ['https://example.test'], expectedRPID: 'example.test', requireUserVerification: true })
  })

  it('adds each configured app, and nothing else', async () => {
    process.env.ANDROID_WEBCREDENTIAL_APPS = `uk.co.example.app:${FP}`
    await verifyMemberRegistration('chal', {} as never)
    expect(seen.opts?.expectedOrigin).toEqual(['https://example.test', androidApkKeyHashOrigin(FP)])
    expect(seen.opts?.expectedRPID).toBe('example.test')
  })
})
