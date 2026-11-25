import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { NextRequest } from 'next/server'
import { hashMemberToken } from '@/lib/members/tokens'

// The page an emailed verification link opens. It hands the panel the
// ?redirect= the member registered with, resolved by the sign-in page's own
// rule, and the token itself is still the only thing that verifies or signs
// anybody in: an expired or spent token goes nowhere, redirect or not.

const state = vi.hoisted(() => ({
  tokens: [] as Array<{ id: string; memberId: string; tokenHash: string; usedAt: Date | null; expiresAt: Date }>,
  member: { id: 'm1', status: 'PENDING_VERIFICATION', username: 'jo' },
  sessions: 0,
  mode: 'OPEN' as string,
}))

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    memberVerificationToken: {
      findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) => state.tokens.find((t) => t.tokenHash === where.tokenHash) ?? null),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; usedAt: null }; data: { usedAt: Date } }) => {
        const t = state.tokens.find((x) => x.id === where.id && x.usedAt === null)
        if (!t) return { count: 0 }
        t.usedAt = data.usedAt
        return { count: 1 }
      }),
    },
    member: {
      findUnique: vi.fn(async () => ({ status: state.member.status })),
      update: vi.fn(async ({ data }: { data: { status: string } }) => {
        state.member.status = data.status
        return { status: state.member.status, username: state.member.username }
      }),
    },
  },
}))
vi.mock('@/lib/members/config', () => ({
  getMembersConfig: async () => ({ enabled: true, registrationMode: state.mode, notifyAdminOnPendingApproval: false }),
}))
vi.mock('@/lib/members/session', () => ({
  createMemberSession: vi.fn(async () => {
    state.sessions++
    return 'session-token'
  }),
  setMemberSessionCookie: vi.fn(async () => {}),
}))
vi.mock('@/lib/members/activity', () => ({ recordMemberActivity: vi.fn(async () => {}) }))
vi.mock('@/lib/members/email-verified', () => ({ notifyMemberEmailVerified: vi.fn(async () => {}) }))
vi.mock('@/lib/members/admin-notify', () => ({ notifyAdminMemberPendingApproval: vi.fn(async () => {}) }))
vi.mock('@/lib/auth/rate-limit', () => ({
  checkAndRecord: async () => ({ allowed: true }),
  getClientIp: async () => '127.0.0.1',
}))
vi.mock('@/lib/members/paths', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/members/paths')>()),
  getMemberAreaPath: () => 'account',
}))
vi.mock('@/components/members/VerifyEmailPanel', () => ({ default: function VerifyEmailPanel() { return null } }))

import VerifyEmailPage from '@/app/(public)/cactus-account/verify-email/page'
import VerifyEmailPanel from '@/components/members/VerifyEmailPanel'
import { POST } from '@/app/api/members/verify-email/route'

const APP_CONNECT = '/api/m/tg-finance/v1/auth/app-connect?state=S&code_challenge=C&redirect_uri=tgfinance%3A%2F%2Fauth'

beforeEach(() => {
  state.tokens = []
  state.member = { id: 'm1', status: 'PENDING_VERIFICATION', username: 'jo' }
  state.sessions = 0
  state.mode = 'OPEN'
})

function panelProps(node: ReactNode): Record<string, unknown> {
  if (!isValidElement(node) || node.type !== VerifyEmailPanel) throw new Error('expected the panel')
  return (node as ReactElement<Record<string, unknown>>).props
}
const pageProps = async (params: Record<string, string>) =>
  panelProps(await VerifyEmailPage({ searchParams: Promise.resolve(params) }))

describe('verification page', () => {
  it('is exactly as before with no redirect', async () => {
    const props = await pageProps({ token: 't' })
    expect(props.accountHref).toBe('/account')
    expect(props.redirectHref).toBeUndefined()
    expect(props.registerHref).toBe('/account/register')
  })

  it('hands on the hand-off redirect, and "sign up again" keeps it', async () => {
    const props = await pageProps({ token: 't', redirect: APP_CONNECT })
    expect(props.redirectHref).toBe(APP_CONNECT)
    expect(new URL(String(props.registerHref), 'https://x.test').searchParams.get('redirect')).toBe(APP_CONNECT)
  })

  it('turns every off-site redirect into the account', async () => {
    for (const bad of ['https://evil.test/', '//evil.test', '/\\evil.test', '/\t/evil.test', 'javascript:alert(1)', '/account/login']) {
      expect((await pageProps({ token: 't', redirect: bad })).redirectHref, JSON.stringify(bad)).toBe('/account')
    }
  })
})

const verify = (token: string) =>
  POST(new NextRequest('http://localhost/api/members/verify-email', { method: 'POST', body: JSON.stringify({ token }) }))

describe('spending the verification token', () => {
  it('verifies and signs in with a live token', async () => {
    state.tokens.push({ id: 'v1', memberId: 'm1', tokenHash: hashMemberToken('live'), usedAt: null, expiresAt: new Date(Date.now() + 60_000) })
    const res = await verify('live')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ACTIVE', signedIn: true })
    expect(state.sessions).toBe(1)
  })

  it('refuses an expired token and signs nobody in', async () => {
    state.tokens.push({ id: 'v1', memberId: 'm1', tokenHash: hashMemberToken('old'), usedAt: null, expiresAt: new Date(Date.now() - 1) })
    const res = await verify('old')
    expect(res.status).toBe(400)
    expect(state.sessions).toBe(0)
    expect(state.member.status).toBe('PENDING_VERIFICATION')
  })

  it('refuses a token that has already been spent', async () => {
    state.tokens.push({ id: 'v1', memberId: 'm1', tokenHash: hashMemberToken('once'), usedAt: null, expiresAt: new Date(Date.now() + 60_000) })
    expect((await verify('once')).status).toBe(200)
    expect((await verify('once')).status).toBe(400)
    expect(state.sessions).toBe(1)
  })

  it('a spare link never undoes a suspension, and signs nobody in', async () => {
    state.member.status = 'SUSPENDED'
    state.tokens.push({ id: 'v2', memberId: 'm1', tokenHash: hashMemberToken('spare'), usedAt: null, expiresAt: new Date(Date.now() + 60_000) })
    expect(await (await verify('spare')).json()).toEqual({ status: 'SUSPENDED', signedIn: false })
    expect(state.member.status).toBe('SUSPENDED')
    expect(state.sessions).toBe(0)
  })

  it('a spare link for an already verified member signs nobody in', async () => {
    state.member.status = 'ACTIVE'
    state.tokens.push({ id: 'v2', memberId: 'm1', tokenHash: hashMemberToken('spare'), usedAt: null, expiresAt: new Date(Date.now() + 60_000) })
    expect(await (await verify('spare')).json()).toEqual({ status: 'ACTIVE', signedIn: false })
    expect(state.sessions).toBe(0)
  })

  it('reports no sign-in when the site holds new members for approval', async () => {
    state.mode = 'APPROVAL_REQUIRED'
    state.tokens.push({ id: 'v1', memberId: 'm1', tokenHash: hashMemberToken('held'), usedAt: null, expiresAt: new Date(Date.now() + 60_000) })
    expect(await (await verify('held')).json()).toEqual({ status: 'PENDING_APPROVAL', signedIn: false })
    expect(state.sessions).toBe(0)
  })
})
