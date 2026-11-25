import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// The member account routes, called by an app with a module's Bearer token
// (core.member-api-auth, lib/members/api-auth.ts) instead of a cookie:
//   - every account route answers a token caller as it answers the browser;
//   - anything that plants or removes a way in needs a step-up grant
//     (lib/members/api-step-up.ts), which is checked before the body is looked
//     at, spent only by the change itself, single-use, five minutes, and bound
//     to the member and the credential that minted it;
//   - the browser's behaviour (fresh-session rule, "this session", sign out the
//     others) is exactly what it was.

const GOOD = 'tgfd_' + 'g'.repeat(43)
const OTHER_DEVICE = 'tgfd_' + 'o'.repeat(43)
const OTHER_MEMBER = 'tgfd_' + 'm'.repeat(43)

type Row = Record<string, unknown>

const s = vi.hoisted(() => ({
  cookieMember: null as null | Record<string, unknown>,
  fresh: true,
  members: {} as Record<string, Record<string, unknown>>,
  passwords: {} as Record<string, { id: string; memberId: string; hash: string }>,
  twoFactor: [] as Array<Record<string, unknown>>,
  passkeys: [] as Array<Record<string, unknown>>,
  challenges: [] as Array<Record<string, unknown>>,
  emailCodes: {} as Record<string, string>,
  sessions: [] as Array<Record<string, unknown>>,
  limited: new Set<string>(),
  calls: [] as string[],
  config: {} as Record<string, unknown>,
}))

function whereMatches(row: Row, where: Row): boolean {
  for (const [k, cond] of Object.entries(where)) {
    const v = row[k]
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as { gt?: Date; lte?: Date; not?: unknown }
      if (c.gt && !(v instanceof Date && v > c.gt)) return false
      if (c.lte && !(v instanceof Date && v <= c.lte)) return false
    } else if (v !== cond) return false
  }
  return true
}

vi.mock('@/lib/db/prisma', () => {
  const rows = () => s.challenges as Row[]
  return {
    prisma: {
      siteConfig: { findUnique: vi.fn(async () => ({ membersConfig: s.config, siteName: 'Test site' })) },
      member: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => s.members[where.id] ?? null),
        findFirst: vi.fn(async () => null),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
          s.calls.push(`member.update:${Object.keys(data).join(',')}`)
          s.members[where.id] = { ...s.members[where.id], ...data }
          return s.members[where.id]
        }),
      },
      memberPassword: {
        findUnique: vi.fn(async ({ where }: { where: { memberId: string } }) => s.passwords[where.memberId] ?? null),
        upsert: vi.fn(async ({ where, create }: { where: { memberId: string }; create: { hash: string } }) => {
          s.calls.push('password.upsert')
          s.passwords[where.memberId] = { id: 'pw', memberId: where.memberId, hash: create.hash }
        }),
        deleteMany: vi.fn(async ({ where }: { where: { memberId: string } }) => {
          s.calls.push('password.deleteMany')
          const had = !!s.passwords[where.memberId]
          delete s.passwords[where.memberId]
          return { count: had ? 1 : 0 }
        }),
      },
      memberTwoFactor: {
        findFirst: vi.fn(async ({ where }: { where: { memberId: string } }) => s.twoFactor.find((t) => t.memberId === where.memberId && t.verified) ?? null),
        deleteMany: vi.fn(async () => {
          s.calls.push('twoFactor.deleteMany')
          s.twoFactor = []
          return { count: 1 }
        }),
        upsert: vi.fn(async () => {
          s.calls.push('twoFactor.upsert')
        }),
      },
      memberPasskey: {
        findMany: vi.fn(async () => s.passkeys),
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => s.passkeys.find((p) => p.id === where.id) ?? null),
        count: vi.fn(async () => s.passkeys.length - 1),
        delete: vi.fn(async ({ where }: { where: { id: string } }) => {
          s.calls.push('passkey.delete')
          s.passkeys = s.passkeys.filter((p) => p.id !== where.id)
        }),
      },
      webAuthnChallenge: {
        create: vi.fn(async ({ data }: { data: Row }) => {
          rows().push({ ...data })
        }),
        count: vi.fn(async ({ where }: { where: Row }) => rows().filter((r) => whereMatches(r, where)).length),
        deleteMany: vi.fn(async ({ where }: { where: Row }) => {
          const gone = rows().filter((r) => whereMatches(r, where))
          s.challenges = rows().filter((r) => !gone.includes(r))
          return { count: gone.length }
        }),
      },
      memberProfileVisibility: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async () => ({ showBio: true, showJoinDate: false, showWebsite: true })),
      },
      memberNotificationPreference: { findMany: vi.fn(async () => []) },
      media: { findUnique: vi.fn(async () => null), delete: vi.fn(async () => ({})) },
    },
  }
})

vi.mock('@/lib/members/session', () => ({
  getMemberFromCookie: async () => s.cookieMember,
  isCurrentMemberSessionFresh: async () => s.fresh,
  getCurrentMemberSessionTokenHash: async () => 'cookie-hash',
  getCurrentMemberTrustedBrowserTokenHash: async () => 'tb-hash',
  listMemberSessions: async () => s.sessions,
  deleteAllMemberSessions: vi.fn(async (memberId: string, except?: string) => {
    s.calls.push(`sessions.deleteAll:${memberId}:${except ?? 'none'}`)
  }),
  revokeMemberSessionById: vi.fn(async (id: string, memberId: string) => {
    s.calls.push(`sessions.revoke:${id}:${memberId}`)
  }),
  listMemberTrustedBrowsers: async () => [
    { id: 'tb1', deviceInfo: 'Firefox', createdAt: new Date(), expiresAt: new Date(), tokenHash: 'tb-hash' },
  ],
  revokeAllMemberTrustedBrowsers: vi.fn(async (memberId: string) => {
    s.calls.push(`trusted.revokeAll:${memberId}`)
  }),
  revokeMemberTrustedBrowserById: vi.fn(async (id: string, memberId: string) => {
    s.calls.push(`trusted.revoke:${id}:${memberId}`)
  }),
}))

vi.mock('@/lib/modules/live-status', () => ({
  getInstalledManifests: async () => [
    { manifest: { name: 'tg-finance', extensionPoints: [{ point: 'core.member-api-auth', id: 'tgf' }] } },
  ],
}))
vi.mock('@/lib/modules/extension-points.server', () => ({
  moduleServerExtensionPointComponents: {
    'core.member-api-auth': {
      tgf: async (token: string) => {
        if (token === GOOD) return { memberId: 'm1', credentialId: 'dev-1', label: "Chris's iPhone" }
        if (token === OTHER_DEVICE) return { memberId: 'm1', credentialId: 'dev-2', label: 'Tablet' }
        if (token === OTHER_MEMBER) return { memberId: 'm2', credentialId: 'dev-9', label: null }
        return null
      },
    },
  },
}))
vi.mock('@/lib/config/site', () => ({ isBehindCloudflare: async () => false }))
vi.mock('@/lib/auth/rate-limit', () => ({
  clientIpFromHeaders: () => '203.0.113.9',
  getClientIp: async () => '203.0.113.9',
  checkRateLimit: async () => ({ allowed: true }),
  recordAttempt: async () => {},
  checkAndRecord: vi.fn(async (action: string) => ({ allowed: !s.limited.has(action) })),
}))
vi.mock('@/lib/config/env', () => ({
  isEmailConfigured: () => true,
  getSessionSecret: () => 'test-secret-that-is-at-least-32-characters',
  getActiveMediaProvider: async () => null,
  isMediaProviderConfigured: () => false,
}))
vi.mock('@/lib/auth/password', () => ({
  verifyPassword: async (plain: string, hash: string) => `hash:${plain}` === hash,
  hashPassword: async (plain: string) => `hash:${plain}`,
  validateNewPassword: async (plain: string) => (plain.length >= 12 ? { valid: true } : { valid: false, reason: 'Too short' }),
}))
vi.mock('@/lib/members/security-alerts', () => ({
  notifyMemberSecurityAlert: vi.fn(async (_m: unknown, body: string) => {
    s.calls.push(`alert:${body}`)
  }),
}))
vi.mock('@/lib/members/activity', () => ({
  recordMemberActivity: vi.fn(async (memberId: string, type: string, opts?: { metadata?: Row }) => {
    s.calls.push(`activity:${memberId}:${type}:${JSON.stringify(opts?.metadata ?? {})}`)
  }),
  listMemberActivity: async () => [{ id: 'e1', type: 'login', source: null, createdAt: new Date() }],
}))
vi.mock('@/lib/email/index', () => ({
  sendLoginOtp: vi.fn(async (to: string, code: string) => {
    s.calls.push(`otp:${to}:${code}`)
  }),
}))
vi.mock('@/lib/email/templates', () => ({ sendMemberEmail: vi.fn(async () => {}) }))
vi.mock('@/lib/members/email-challenge', () => ({
  createMemberEmailChallenge: vi.fn(async (memberId: string, purpose: string) => {
    s.emailCodes[`${memberId}:${purpose}`] = '246810'
    return '246810'
  }),
  verifyMemberEmailChallenge: vi.fn(async (memberId: string, purpose: string, code: string) => {
    const ok = s.emailCodes[`${memberId}:${purpose}`] === code
    if (ok) delete s.emailCodes[`${memberId}:${purpose}`]
    return ok ? { success: true, pendingEmail: null } : { success: false, reason: 'invalid' }
  }),
  pendingMemberEmailChange: async () => null,
}))
vi.mock('@/lib/members/registration', () => ({ isEmailDomainAllowed: () => true }))
vi.mock('@/lib/members/email-verified', () => ({ notifyMemberEmailVerified: async () => {} }))
vi.mock('@/lib/members/passkey', () => ({
  createMemberRegistrationChallenge: vi.fn(async () => ({ challenge: 'chal', rp: { id: 'example.test' } })),
  verifyMemberRegistration: vi.fn(async () => ({
    verification: { verified: true, registrationInfo: { credential: { id: 'cred' } } },
    memberId: 'm1',
  })),
  saveMemberPasskey: vi.fn(async (_memberId: string, _info: unknown, _t: unknown, label?: string) => {
    s.calls.push(`passkey.save:${label}`)
  }),
}))
vi.mock('@/lib/members/admin-passkey-manage', () => ({
  findLinkedAdminForMember: vi.fn(async () => {
    s.calls.push('admin.lookup')
    return null
  }),
  consumeAdminStepUpGrant: vi.fn(async () => false),
  saveAdminCopyOfPasskey: vi.fn(async () => {}),
}))
vi.mock('@/lib/members/recovery-codes', () => ({
  generateMemberRecoveryCodes: vi.fn(async () => {
    s.calls.push('recovery.generate')
    return ['aaaa-bbbb']
  }),
  countRemainingRecoveryCodes: async () => 7,
}))
vi.mock('@/lib/auth/totp', () => ({
  generateTotpSecret: () => 'SECRET',
  buildOtpauthUri: () => 'otpauth://totp/x',
  generateQrDataUrl: async () => 'data:image/png;base64,xx',
  verifyTotpCode: () => ({ valid: false }),
}))
vi.mock('@/lib/crypto/secrets', () => ({ encryptSecret: (v: string) => `enc:${v}`, decryptSecret: (v: string) => v }))
vi.mock('@/lib/members/notification-categories', () => ({ getVisibleModuleNotificationCategories: async () => [] }))
vi.mock('@/lib/sms/send', () => ({ isSmsAvailable: async () => false }))
vi.mock('@/lib/config/timezone.server', () => ({ getSiteTimezone: async () => 'Europe/London' }))
vi.mock('@/lib/media/upload', () => ({
  validateUpload: async () => ({ valid: false, reason: 'no' }),
  uploadMedia: async () => ({}),
  deleteMedia: async () => {},
  saveMediaRecord: async () => ({}),
}))
vi.mock('@/lib/auth/passkey', () => ({ labelFromUserAgent: () => 'Safari on macOS' }))

import * as profile from './profile/route'
import * as visibility from './profile-visibility/route'
import * as avatar from './avatar/route'
import * as username from './username/route'
import * as contact from './contact/route'
import * as notifications from './notifications/route'
import * as activity from './activity/route'
import * as email from './email/route'
import * as password from './password/route'
import * as passkeys from './passkeys/route'
import * as passkeyById from './passkeys/[id]/route'
import * as registerOptions from './auth/passkey/register-options/route'
import * as registerVerify from './auth/passkey/register-verify/route'
import * as twoFactor from './2fa/route'
import * as setupOptions from './2fa/setup-options/route'
import * as setupVerify from './2fa/setup-verify/route'
import * as recovery from './recovery-codes/route'
import * as sessions from './sessions/route'
import * as sessionById from './sessions/[id]/route'
import * as trusted from './trusted-browsers/route'
import * as trustedById from './trusted-browsers/[id]/route'
import * as stepUp from './step-up/route'
import { STEP_UP_PURPOSE, STEP_UP_TTL_MS } from '@/lib/members/api-step-up'

const M1 = {
  id: 'm1',
  email: 'chris@example.com',
  username: 'chris',
  status: 'ACTIVE',
  userId: null,
  displayName: 'Chris',
  bio: null,
  websiteUrl: null,
  avatarChoice: 'GENERATED',
  avatarMediaId: null,
  usernameChangedAt: null,
  emailVerified: true,
  createdAt: new Date('2026-01-01'),
}

type Opts = { token?: string | null; method?: string; body?: unknown; grant?: string; cookie?: boolean; headers?: Record<string, string> }

function request(path: string, opts: Opts = {}): NextRequest {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) }
  const token = opts.token === undefined ? GOOD : opts.token
  if (token) headers.authorization = `Bearer ${token}`
  if (opts.grant) headers['x-cactus-step-up'] = opts.grant
  if (opts.body !== undefined) headers['content-type'] = 'application/json'
  return new NextRequest(`https://example.test/api/members/${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

async function grantFor(token = GOOD): Promise<string> {
  const res = await stepUp.POST(request('step-up', { token, method: 'POST', body: { method: 'password', password: 'correct horse' } }))
  expect(res.status).toBe(200)
  const body = (await res.json()) as { grant: string }
  return body.grant
}

beforeEach(() => {
  s.cookieMember = null
  s.fresh = true
  s.members = { m1: { ...M1 }, m2: { ...M1, id: 'm2', email: 'other@example.com', username: 'other' } }
  s.passwords = { m1: { id: 'pw', memberId: 'm1', hash: 'hash:correct horse' }, m2: { id: 'pw2', memberId: 'm2', hash: 'hash:correct horse' } }
  s.twoFactor = [{ id: 't1', memberId: 'm1', method: 'EMAIL', verified: true }]
  s.passkeys = [
    { id: 'pk1', memberId: 'm1', credentialId: 'c1', transports: [] },
    { id: 'pk2', memberId: 'm1', credentialId: 'c2', transports: [] },
  ]
  s.challenges = []
  s.emailCodes = {}
  s.sessions = [
    { id: 's1', tokenHash: 'cookie-hash', ipAddress: null, userAgent: 'Firefox', location: null, lastActiveAt: new Date(), createdAt: new Date(), expiresAt: new Date() },
    { id: 's2', tokenHash: 'other-hash', ipAddress: null, userAgent: 'Chrome', location: null, lastActiveAt: new Date(), createdAt: new Date(), expiresAt: new Date() },
  ]
  s.limited = new Set()
  s.calls = []
  s.config = {
    authMethodPolicies: { PASSKEY: 'OPTIONAL', MAGIC_LINK: 'OPTIONAL', PASSWORD: 'OPTIONAL' },
    usernameChangesEnabled: true,
  }
})

// [label, call(opts)] for every route an app may call without a step-up.
const OPEN_ROUTES: Array<[string, (o: Opts) => Promise<Response>]> = [
  ['GET profile', (o) => profile.GET(request('profile', o))],
  ['PATCH profile', (o) => profile.PATCH(request('profile', { ...o, method: 'PATCH', body: { displayName: 'Chris T' } }))],
  ['GET profile-visibility', (o) => visibility.GET(request('profile-visibility', o))],
  ['PATCH profile-visibility', (o) => visibility.PATCH(request('profile-visibility', { ...o, method: 'PATCH', body: { showJoinDate: false } }))],
  ['PATCH avatar', (o) => avatar.PATCH(request('avatar', { ...o, method: 'PATCH', body: { avatarChoice: 'GRAVATAR' } }))],
  ['DELETE avatar', (o) => avatar.DELETE(request('avatar', { ...o, method: 'DELETE' }))],
  ['POST username', (o) => username.POST(request('username', { ...o, method: 'POST', body: { username: 'Chris' } }))],
  ['PATCH contact', (o) => contact.PATCH(request('contact', { ...o, method: 'PATCH', body: { fullName: 'Chris Taylor' } }))],
  ['GET notifications', (o) => notifications.GET(request('notifications', o))],
  ['GET activity', (o) => activity.GET(request('activity', o))],
  ['GET email', (o) => email.GET(request('email', o))],
  ['GET password', (o) => password.GET(request('password', o))],
  ['GET passkeys', (o) => passkeys.GET(request('passkeys', o))],
  ['GET 2fa', (o) => twoFactor.GET(request('2fa', o))],
  ['GET recovery-codes', (o) => recovery.GET(request('recovery-codes', o))],
  ['GET sessions', (o) => sessions.GET(request('sessions', o))],
  ['DELETE sessions', (o) => sessions.DELETE(request('sessions', { ...o, method: 'DELETE' }))],
  ['DELETE sessions/{id}', (o) => sessionById.DELETE(request('sessions/s2', { ...o, method: 'DELETE' }), params('s2'))],
  ['GET trusted-browsers', (o) => trusted.GET(request('trusted-browsers', o))],
  ['DELETE trusted-browsers', (o) => trusted.DELETE(request('trusted-browsers', { ...o, method: 'DELETE' }))],
  ['DELETE trusted-browsers/{id}', (o) => trustedById.DELETE(request('trusted-browsers/tb1', { ...o, method: 'DELETE' }), params('tb1'))],
]

describe('every account route answers an app', () => {
  it.each(OPEN_ROUTES)('%s: 401 with no credential, a bad token, or a module-less token', async (_label, call) => {
    expect((await call({ token: null })).status).toBe(401)
    expect((await call({ token: 'tgfd_' + 'x'.repeat(43) })).status).toBe(401)
    expect((await call({ token: 'not a token' })).status).toBe(401)
  })

  it.each(OPEN_ROUTES)('%s: 200 for a live token', async (_label, call) => {
    expect((await call({})).status).toBe(200)
  })

  it.each(OPEN_ROUTES)('%s: 200 for the browser, as before', async (_label, call) => {
    s.cookieMember = s.members.m1 ?? null
    expect((await call({ token: null })).status).toBe(200)
  })

  it('GET contact keeps its quiet 204 for nobody, and answers an app', async () => {
    expect((await contact.GET(request('contact', { token: null }))).status).toBe(204)
    const res = await contact.GET(request('contact'))
    expect(res.status).toBe(200)
    expect((await res.json()).email).toBe('chris@example.com')
  })

  it('a token acts on its own member only', async () => {
    const res = await profile.GET(request('profile', { token: OTHER_MEMBER }))
    expect((await res.json()).email).toBe('other@example.com')
  })
})

describe('browser sessions and trusted browsers, seen from an app', () => {
  it('no browser session is "this one" for an app, and "sign out the others" signs out every browser', async () => {
    const list = await (await sessions.GET(request('sessions'))).json()
    expect(list.sessions.map((x: { isCurrent: boolean }) => x.isCurrent)).toEqual([false, false])
    await sessions.DELETE(request('sessions', { method: 'DELETE' }))
    expect(s.calls).toContain('sessions.deleteAll:m1:none')
  })

  it('the browser still sees itself and keeps itself', async () => {
    s.cookieMember = s.members.m1 ?? null
    const list = await (await sessions.GET(request('sessions', { token: null }))).json()
    expect(list.sessions.map((x: { isCurrent: boolean }) => x.isCurrent)).toEqual([true, false])
    await sessions.DELETE(request('sessions', { token: null, method: 'DELETE' }))
    expect(s.calls).toContain('sessions.deleteAll:m1:cookie-hash')
  })

  it('trusted browsers: none is current for an app, the browser still finds its own', async () => {
    expect((await (await trusted.GET(request('trusted-browsers'))).json()).trustedBrowsers[0].isCurrent).toBe(false)
    s.cookieMember = s.members.m1 ?? null
    expect((await (await trusted.GET(request('trusted-browsers', { token: null }))).json()).trustedBrowsers[0].isCurrent).toBe(true)
  })
})

describe('POST /api/members/step-up', () => {
  it('is for apps only', async () => {
    s.cookieMember = s.members.m1 ?? null
    expect((await stepUp.GET(request('step-up', { token: null }))).status).toBe(400)
    expect((await stepUp.POST(request('step-up', { token: null, method: 'POST', body: { method: 'password', password: 'correct horse' } }))).status).toBe(400)
    expect((await stepUp.POST(request('step-up', { token: null, method: 'POST', body: { method: 'password', password: 'x' } })) as Response).status).toBe(400)
  })

  it('401 without a credential', async () => {
    expect((await stepUp.POST(request('step-up', { token: null, method: 'POST', body: { method: 'password', password: 'x' } }))).status).toBe(401)
  })

  it('lists the methods this member can use', async () => {
    expect(await (await stepUp.GET(request('step-up'))).json()).toEqual({ methods: { password: true, email: true }, ttlSeconds: 300 })
    delete s.passwords.m1
    expect((await (await stepUp.GET(request('step-up'))).json()).methods).toEqual({ password: false, email: true })
  })

  it('the right password mints a grant, logs it, and keeps only a hash', async () => {
    const res = await stepUp.POST(request('step-up', { method: 'POST', body: { method: 'password', password: 'correct horse' } }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.grant).toMatch(/^csu_[A-Za-z0-9_-]{43}$/)
    expect(new Date(body.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(STEP_UP_TTL_MS)
    expect(s.challenges).toHaveLength(1)
    expect(s.challenges[0]).toMatchObject({ memberId: 'm1', purpose: STEP_UP_PURPOSE })
    expect(JSON.stringify(s.challenges[0])).not.toContain(body.grant)
    expect(s.calls).toContain(`activity:m1:step_up_confirmed:${JSON.stringify({ method: 'password', app: 'tg-finance', device: "Chris's iPhone" })}`)
  })

  it('a wrong password is a 401 and no grant', async () => {
    const res = await stepUp.POST(request('step-up', { method: 'POST', body: { method: 'password', password: 'wrong' } }))
    expect(res.status).toBe(401)
    expect(s.challenges).toHaveLength(0)
  })

  it('no password on the account: told to use a code', async () => {
    delete s.passwords.m1
    expect((await stepUp.POST(request('step-up', { method: 'POST', body: { method: 'password', password: 'anything' } }))).status).toBe(400)
  })

  it('an emailed code: sent to the account address, then exchanged for a grant once', async () => {
    const sent = await stepUp.POST(request('step-up', { method: 'POST', body: { method: 'email' } }))
    expect(await sent.json()).toEqual({ sent: true })
    expect(s.calls).toContain('otp:chris@example.com:246810')

    expect((await stepUp.POST(request('step-up', { method: 'POST', body: { method: 'email', code: '000000' } }))).status).toBe(401)
    const ok = await stepUp.POST(request('step-up', { method: 'POST', body: { method: 'email', code: '246810' } }))
    expect(ok.status).toBe(200)
    expect((await ok.json()).grant).toMatch(/^csu_/)
    expect((await stepUp.POST(request('step-up', { method: 'POST', body: { method: 'email', code: '246810' } }))).status).toBe(401)
  })

  it('rate limited: guesses and code requests each have their own bucket', async () => {
    s.limited.add('member_api_step_up')
    expect((await stepUp.POST(request('step-up', { method: 'POST', body: { method: 'password', password: 'correct horse' } }))).status).toBe(429)
    expect(s.challenges).toHaveLength(0)
    expect((await stepUp.POST(request('step-up', { method: 'POST', body: { method: 'email' } }))).status).toBe(200)
    s.limited.add('member_api_step_up_send')
    expect((await stepUp.POST(request('step-up', { method: 'POST', body: { method: 'email' } }))).status).toBe(429)
  })

  it('rejects anything else', async () => {
    expect((await stepUp.POST(request('step-up', { method: 'POST', body: { method: 'sms' } }))).status).toBe(400)
    expect((await stepUp.POST(request('step-up', { method: 'POST', body: { method: 'password' } }))).status).toBe(400)
  })
})

// [label, call(opts), the side effect that must not happen without a grant]
const GUARDED: Array<[string, (o: Opts) => Promise<Response>, string]> = [
  ['POST email', (o) => email.POST(request('email', { ...o, method: 'POST', body: { newEmail: 'new@example.com', currentPassword: 'correct horse' } })), 'activity'],
  ['POST password (change)', (o) => password.POST(request('password', { ...o, method: 'POST', body: { currentPassword: 'correct horse', newPassword: 'a much longer password' } })), 'password.upsert'],
  ['DELETE password', (o) => password.DELETE(request('password', { ...o, method: 'DELETE' })), 'password.deleteMany'],
  ['DELETE passkeys/{id}', (o) => passkeyById.DELETE(request('passkeys/pk1', { ...o, method: 'DELETE' }), params('pk1')), 'passkey.delete'],
  ['POST passkey register-options', (o) => registerOptions.POST(request('auth/passkey/register-options', { ...o, method: 'POST' })), 'never'],
  ['POST 2fa/setup-options', (o) => setupOptions.POST(request('2fa/setup-options', { ...o, method: 'POST', body: { method: 'AUTHENTICATOR_APP' } })), 'twoFactor.upsert'],
  ['POST recovery-codes', (o) => recovery.POST(request('recovery-codes', { ...o, method: 'POST' })), 'recovery.generate'],
]

describe('sensitive changes from an app need a step-up grant', () => {
  beforeEach(() => {
    // DELETE 2fa is refused while a password is set, so it gets its own case below.
    s.config = { ...s.config }
  })

  it.each(GUARDED)('%s: refused without a grant, and nothing changes', async (_label, call, effect) => {
    const res = await call({})
    expect(res.status).toBe(403)
    expect((await res.json()).stepUpRequired).toBe(true)
    expect(s.calls.some((c) => c.startsWith(effect))).toBe(false)
  })

  it.each(GUARDED)('%s: refused with a malformed grant', async (_label, call) => {
    expect((await call({ grant: 'csu_short' })).status).toBe(403)
  })

  it.each(GUARDED)('%s: works with a grant, which is then spent', async (_label, call) => {
    const grant = await grantFor()
    const res = await call({ grant })
    expect(res.status).toBe(200)
    expect(s.challenges).toHaveLength(0)
    const again = await call({ grant })
    expect(again.status).toBe(403)
  })

  it.each(GUARDED)('%s: an expired grant is refused', async (_label, call) => {
    const grant = await grantFor()
    s.challenges = s.challenges.map((row) => ({ ...row, expiresAt: new Date(Date.now() - 1000) }))
    expect((await call({ grant })).status).toBe(403)
  })

  it.each(GUARDED)("%s: another device's grant is refused, even for the same member", async (_label, call) => {
    const grant = await grantFor(OTHER_DEVICE)
    expect((await call({ grant })).status).toBe(403)
    expect(s.challenges).toHaveLength(1)
  })

  it.each(GUARDED)("%s: another member's grant is refused", async (_label, call) => {
    const grant = await grantFor(OTHER_MEMBER)
    expect((await call({ grant })).status).toBe(403)
    expect(s.challenges).toHaveLength(1)
  })

  it('DELETE 2fa: refused without a grant; with one, removed and alerted', async () => {
    delete s.passwords.m1
    expect((await twoFactor.DELETE(request('2fa', { method: 'DELETE' }))).status).toBe(403)
    expect(s.calls).not.toContain('twoFactor.deleteMany')
    s.passwords.m1 = { id: 'pw', memberId: 'm1', hash: 'hash:correct horse' }
    const grant = await grantFor()
    delete s.passwords.m1
    const res = await twoFactor.DELETE(request('2fa', { method: 'DELETE', grant }))
    expect(res.status).toBe(200)
    expect(s.calls).toContain('twoFactor.deleteMany')
    expect(s.challenges).toHaveLength(0)
  })

  it('a request that fails its own checks does not spend the grant', async () => {
    const grant = await grantFor()
    const weak = await password.POST(request('password', { method: 'POST', grant, body: { currentPassword: 'correct horse', newPassword: 'short' } }))
    expect(weak.status).toBe(400)
    expect(s.challenges).toHaveLength(1)
    const wrong = await password.POST(request('password', { method: 'POST', grant, body: { currentPassword: 'nope', newPassword: 'a much longer password' } }))
    expect(wrong.status).toBe(400)
    expect(s.challenges).toHaveLength(1)
    const ok = await password.POST(request('password', { method: 'POST', grant, body: { currentPassword: 'correct horse', newPassword: 'a much longer password' } }))
    expect(ok.status).toBe(200)
  })

  it('the current password is still required on top of the grant', async () => {
    const grant = await grantFor()
    const res = await password.POST(request('password', { method: 'POST', grant, body: { newPassword: 'a much longer password' } }))
    expect(res.status).toBe(400)
  })

  it('a password change from an app signs every browser out and drops trusted browsers', async () => {
    const grant = await grantFor()
    await password.POST(request('password', { method: 'POST', grant, body: { currentPassword: 'correct horse', newPassword: 'a much longer password' } }))
    expect(s.calls).toContain('sessions.deleteAll:m1:none')
    expect(s.calls).toContain('trusted.revokeAll:m1')
    expect(s.calls).toContain('alert:Your password was changed.')
  })

  it('removing a password sends a security alert', async () => {
    const grant = await grantFor()
    await password.DELETE(request('password', { method: 'DELETE', grant }))
    expect(s.calls).toContain('alert:The password was removed from your account.')
  })
})

describe('the browser keeps its own rules on the same routes', () => {
  beforeEach(() => {
    s.cookieMember = s.members.m1 ?? null
  })

  it.each(GUARDED)('%s: no grant needed from a fresh browser session', async (_label, call) => {
    expect((await call({ token: null })).status).toBe(200)
  })

  it('a stale session still has to sign in again to add a passkey or set up 2FA', async () => {
    s.fresh = false
    const options = await registerOptions.POST(request('auth/passkey/register-options', { token: null, method: 'POST' }))
    expect(options.status).toBe(403)
    expect((await options.json()).reauthRequired).toBe(true)
    const setup = await setupOptions.POST(request('2fa/setup-options', { token: null, method: 'POST', body: { method: 'EMAIL' } }))
    expect(setup.status).toBe(403)
    const verify = await registerVerify.POST(request('auth/passkey/register-verify', { token: null, method: 'POST', body: { response: {} } }))
    expect(verify.status).toBe(403)
  })

  it('a step-up grant does not stand in for a stale browser session', async () => {
    s.fresh = false
    const options = await registerOptions.POST(request('auth/passkey/register-options', { token: null, method: 'POST', grant: 'csu_' + 'a'.repeat(43) }))
    expect(options.status).toBe(403)
  })

  it('a browser password change keeps the browser signed in', async () => {
    await password.POST(request('password', { token: null, method: 'POST', body: { currentPassword: 'correct horse', newPassword: 'a much longer password' } }))
    expect(s.calls).toContain('sessions.deleteAll:m1:cookie-hash')
  })

  it('a cookie session beats a token on the same request', async () => {
    const res = await profile.GET(request('profile', { token: OTHER_MEMBER }))
    expect((await res.json()).email).toBe('chris@example.com')
  })
})

describe('adding a passkey from an app', () => {
  it('the fresh-session rule does not apply, the grant does, and the challenge carries the rest', async () => {
    s.fresh = false
    expect((await registerOptions.POST(request('auth/passkey/register-options', { method: 'POST' }))).status).toBe(403)
    const grant = await grantFor()
    const options = await registerOptions.POST(request('auth/passkey/register-options', { method: 'POST', grant }))
    expect(options.status).toBe(200)

    const clientDataJSON = Buffer.from(JSON.stringify({ challenge: 'chal' })).toString('base64')
    const verify = await registerVerify.POST(
      request('auth/passkey/register-verify', { method: 'POST', body: { response: { clientDataJSON, transports: ['internal'] } } })
    )
    expect(verify.status).toBe(200)
    expect(await verify.json()).toEqual({ verified: true, addedToAdmin: false })
    // Named after the device, not a guess from the user agent; and the
    // browser-only admin copy is never even looked up.
    expect(s.calls).toContain("passkey.save:Chris's iPhone")
    expect(s.calls).not.toContain('admin.lookup')
    expect(s.calls).toContain('alert:A new passkey was added to your account.')
  })

  it("a challenge minted for another member is refused", async () => {
    const clientDataJSON = Buffer.from(JSON.stringify({ challenge: 'chal' })).toString('base64')
    const verify = await registerVerify.POST(
      request('auth/passkey/register-verify', { token: OTHER_MEMBER, method: 'POST', body: { response: { clientDataJSON } } })
    )
    expect(verify.status).toBe(403)
  })
})

describe('2FA setup from an app', () => {
  it('setup-verify needs no second grant: it is bound to what setup-options minted', async () => {
    const grant = await grantFor()
    expect((await setupOptions.POST(request('2fa/setup-options', { method: 'POST', grant, body: { method: 'EMAIL' } }))).status).toBe(200)
    expect(s.calls).toContain('otp:chris@example.com:246810')
    const verify = await setupVerify.POST(request('2fa/setup-verify', { method: 'POST', body: { method: 'EMAIL', code: '246810' } }))
    expect(verify.status).toBe(200)
  })
})
