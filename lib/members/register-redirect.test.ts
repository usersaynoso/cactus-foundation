import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { NextRequest } from 'next/server'

// Signing up carries the same ?redirect= signing in does. The register page
// resolves it by the sign-in page's rule, the form posts it, and whichever
// email the registration sends - a verification link for a new address, a
// sign-in link or a fresh verification link for one already registered - ends
// at it. Anything that is not a same-site path is dropped without costing the
// visitor their account, and with no redirect every email is as it always was.

type Sent = { to: string; key: string; vars: { verifyUrl?: string; magicUrl?: string } }

const state = vi.hoisted(() => ({
  sent: [] as Sent[],
  existing: null as null | Record<string, unknown>,
  created: [] as Array<Record<string, unknown>>,
  emailVerificationRequired: true,
}))

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    // Username availability: every generated handle is free.
    $queryRaw: vi.fn(async () => []),
    member: {
      findUnique: vi.fn(async ({ where }: { where: { email?: string } }) =>
        where.email && state.existing && state.existing.email === where.email ? state.existing : null,
      ),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `new${state.created.length + 1}`, ...data }
        state.created.push(row)
        return row
      }),
    },
    memberVerificationToken: {
      create: vi.fn(async () => ({})),
      findFirst: vi.fn(async () => null),
    },
    memberMagicLink: { create: vi.fn(async () => ({})) },
    memberConsentRecord: { create: vi.fn(async () => ({})) },
    siteConfig: { findUnique: vi.fn(async () => ({ siteName: 'Test site', privacyPolicyPageId: null })) },
    infoPage: { findUnique: vi.fn(async () => null) },
  },
}))
vi.mock('@/lib/members/config', () => ({
  getMembersConfig: async () => ({
    enabled: true,
    registrationMode: 'OPEN',
    emailVerificationRequired: state.emailVerificationRequired,
    registrationCollectUsername: false,
    registrationCollectDisplayName: false,
    gravatarEnabled: false,
    notifyAdminOnPendingApproval: false,
    allowedEmailDomains: [],
    blockedEmailDomains: [],
  }),
  isAuthMethodEnabled: () => true,
  registrationPasswordPolicy: () => 'OFF',
}))
vi.mock('@/lib/email/templates', () => ({
  sendMemberEmail: vi.fn(async (to: { email: string }, key: string, vars: Sent['vars']) => {
    state.sent.push({ to: to.email, key, vars })
  }),
}))
vi.mock('@/lib/auth/turnstile', () => ({ verifyTurnstile: async () => true }))
vi.mock('@/lib/auth/rate-limit', () => ({
  checkAndRecord: async () => ({ allowed: true }),
  getClientIp: async () => '127.0.0.1',
}))
vi.mock('@/lib/config/env', () => ({ isEmailConfigured: () => true }))
vi.mock('@/lib/members/default-role', () => ({ getOrCreateMembersRoleId: async () => 'role1' }))
vi.mock('@/lib/members/admin-notify', () => ({ notifyAdminMemberPendingApproval: vi.fn(async () => {}) }))
vi.mock('@/lib/members/paths', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/members/paths')>()),
  getMemberAreaPath: () => 'account',
}))
vi.mock('@/components/members/RegisterForm', () => ({ default: function RegisterForm() { return null } }))

import { POST as register } from '@/app/api/members/register/route'
import { POST as resend } from '@/app/api/members/verify-email/resend/route'
import MemberRegisterPage from '@/app/(public)/cactus-account/register/page'
import RegisterForm from '@/components/members/RegisterForm'

const APP_CONNECT = '/api/m/tg-finance/v1/auth/app-connect?state=S&code_challenge=C&code_challenge_method=S256&redirect_uri=tgfinance%3A%2F%2Fauth'
const OFF_SITE = [
  'https://evil.test/',
  'http://evil.test',
  '//evil.test',
  '/\\evil.test',
  '/\t/evil.test',
  '/\n/evil.test',
  'evil.test',
  'javascript:alert(1)',
  'tgfinance://auth?code=x',
  '/x?u=https://evil.test',
]

beforeEach(() => {
  vi.stubEnv('SITE_URL', 'https://example.test/')
  state.sent = []
  state.existing = null
  state.created = []
  state.emailVerificationRequired = true
})

const post = (route: (r: NextRequest) => Promise<Response>, path: string, body: unknown) =>
  route(new NextRequest(`http://localhost${path}`, { method: 'POST', body: JSON.stringify(body) }))
const signUp = (extra: Record<string, unknown> = {}) =>
  post(register, '/api/members/register', { email: 'jo@example.com', agreedToPolicy: true, ...extra })
const linkOf = (s?: Sent) => new URL(s?.vars.verifyUrl ?? s?.vars.magicUrl ?? 'missing:')

describe('POST /api/members/register', () => {
  it('sends the same verification link as before when no redirect is given', async () => {
    const res = await signUp()
    expect(res.status).toBe(200)
    expect(state.sent).toHaveLength(1)
    expect(state.sent[0]?.key).toBe('member.verify-email')
    const url = linkOf(state.sent[0])
    expect(url.origin + url.pathname).toBe('https://example.test/account/verify-email')
    expect([...url.searchParams.keys()]).toEqual(['token'])
  })

  it('carries the hand-off redirect into the verification link, intact', async () => {
    await signUp({ redirectTo: APP_CONNECT })
    const url = linkOf(state.sent[0])
    expect(url.searchParams.get('redirect')).toBe(APP_CONNECT)
    expect(url.searchParams.get('token')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('drops every off-site redirect but still makes the account and sends the link', async () => {
    for (const bad of OFF_SITE) {
      state.sent = []
      state.created = []
      const res = await signUp({ redirectTo: bad })
      expect(res.status, JSON.stringify(bad)).toBe(200)
      expect(state.created).toHaveLength(1)
      expect(state.sent).toHaveLength(1)
      expect(linkOf(state.sent[0]).searchParams.has('redirect'), JSON.stringify(bad)).toBe(false)
    }
  })

  it('never lets a malformed redirect cost the visitor their account', async () => {
    for (const odd of [42, null, { a: 1 }, `/${'x'.repeat(5000)}`]) {
      state.sent = []
      expect((await signUp({ redirectTo: odd })).status).toBe(200)
      expect(linkOf(state.sent[0]).searchParams.has('redirect')).toBe(false)
    }
  })

  it('answers an already-registered address the same way, its sign-in link carrying the redirect', async () => {
    state.existing = { id: 'm1', email: 'jo@example.com', status: 'ACTIVE', username: 'jo', password: null, passkeys: [] }
    const fresh = await (await signUp({ redirectTo: APP_CONNECT, email: 'new@example.com' })).json()
    state.sent = []
    const known = await (await signUp({ redirectTo: APP_CONNECT })).json()
    expect(known).toEqual(fresh)
    expect(state.sent[0]?.key).toBe('member.magic-link')
    const url = linkOf(state.sent[0])
    expect(url.pathname).toBe('/account/login')
    expect(url.searchParams.get('redirect')).toBe(APP_CONNECT)
  })

  it('re-sends an unverified address its verification link, carrying the redirect', async () => {
    state.existing = { id: 'm1', email: 'jo@example.com', status: 'PENDING_VERIFICATION', username: 'jo', password: null, passkeys: [] }
    await signUp({ redirectTo: APP_CONNECT })
    expect(state.sent[0]?.key).toBe('member.verify-email')
    expect(linkOf(state.sent[0]).searchParams.get('redirect')).toBe(APP_CONNECT)
  })

  it('sends nothing at all on a site that does not verify, redirect or not', async () => {
    state.emailVerificationRequired = false
    expect(await (await signUp({ redirectTo: APP_CONNECT })).json()).toMatchObject({ status: 'ACTIVE', verifyEmailRequired: false })
    expect(state.sent).toHaveLength(0)
  })
})

describe('POST /api/members/verify-email/resend', () => {
  beforeEach(() => {
    state.existing = { id: 'm1', email: 'jo@example.com', status: 'PENDING_VERIFICATION' }
  })

  it('resends the plain link when no redirect is given', async () => {
    expect(await (await post(resend, '/api/members/verify-email/resend', { email: 'jo@example.com' })).json()).toEqual({ ok: true })
    expect([...linkOf(state.sent[0]).searchParams.keys()]).toEqual(['token'])
  })

  it('carries a same-site redirect into the fresh link', async () => {
    await post(resend, '/api/members/verify-email/resend', { email: 'jo@example.com', redirectTo: APP_CONNECT })
    expect(linkOf(state.sent[0]).searchParams.get('redirect')).toBe(APP_CONNECT)
  })

  it('drops an off-site redirect and still answers {ok:true}', async () => {
    for (const bad of OFF_SITE) {
      state.sent = []
      expect(await (await post(resend, '/api/members/verify-email/resend', { email: 'jo@example.com', redirectTo: bad })).json()).toEqual({ ok: true })
      expect(linkOf(state.sent[0]).searchParams.has('redirect'), JSON.stringify(bad)).toBe(false)
    }
  })
})

function findRegisterForm(node: ReactNode): ReactElement<Record<string, unknown>> | null {
  if (!isValidElement(node)) return null
  if (node.type === RegisterForm) return node as ReactElement<Record<string, unknown>>
  const children = (node.props as { children?: ReactNode }).children
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findRegisterForm(child)
    if (found) return found
  }
  return null
}
const formProps = async (params: Record<string, string>) =>
  findRegisterForm(await MemberRegisterPage({ searchParams: Promise.resolve(params) }))!.props

describe('register page', () => {
  it('gives the form no redirect when the visitor brought none', async () => {
    const props = await formProps({})
    expect(props.redirect).toBeUndefined()
    expect(props.signInHref).toBeUndefined()
  })

  it('hands the form the hand-off redirect, and a sign-in link that keeps it', async () => {
    const props = await formProps({ redirect: APP_CONNECT })
    expect(props.redirect).toBe(APP_CONNECT)
    const signIn = new URL(String(props.signInHref), 'https://example.test')
    expect(signIn.pathname).toBe('/account/login')
    expect(signIn.searchParams.get('redirect')).toBe(APP_CONNECT)
  })

  it('turns every off-site or looping redirect into the account', async () => {
    for (const bad of [...OFF_SITE, '/account/register', '/account/login?redirect=%2Fx']) {
      expect((await formProps({ redirect: bad })).redirect, JSON.stringify(bad)).toBe('/account')
    }
  })
})
