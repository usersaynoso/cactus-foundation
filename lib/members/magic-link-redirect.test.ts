import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { NextRequest } from 'next/server'

// The email sign-in link carries the ?redirect= the member arrived at the
// sign-in page with, so it ends where a passkey or password sign-in would have.
// With no redirect asked for, every link stays exactly as it was.

const state = vi.hoisted(() => ({
  sent: [] as Array<{ to: string; key: string; vars: { magicUrl?: string } }>,
  member: null as null | { id: string; email: string; password: null; passkeys: [] },
}))

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    memberMagicLink: { create: vi.fn(async () => ({})) },
    member: { findUnique: vi.fn(async () => state.member) },
    siteConfig: { findUnique: vi.fn(async () => ({ siteName: 'Test site', membersConfig: { enabled: true } })) },
  },
}))
vi.mock('@/lib/email/templates', () => ({
  sendMemberEmail: vi.fn(async (to: { email: string }, key: string, vars: { magicUrl?: string }) => {
    state.sent.push({ to: to.email, key, vars })
  }),
}))
vi.mock('@/lib/auth/rate-limit', () => ({
  checkAndRecord: async () => ({ allowed: true }),
  getClientIp: async () => '127.0.0.1',
}))
vi.mock('@/lib/config/env', () => ({ isEmailConfigured: () => true }))
vi.mock('@/lib/members/paths', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/members/paths')>()),
  getMemberAreaPath: () => 'account',
}))
// Login page plumbing that is not what is under test.
vi.mock('@/lib/auth/session', () => ({ getSessionFromCookie: async () => null }))
vi.mock('@/lib/layout/resolveThemeLayout', () => ({ resolveThemeLayout: async () => null }))
vi.mock('@/lib/puck/renderLayoutWithContent', () => ({ renderLayoutWithContent: () => null }))
vi.mock('@/lib/puck/renderMetadata', () => ({ getPuckRenderMetadata: async () => ({}) }))
vi.mock('@/components/members/LoginForm', () => ({ default: function LoginForm() { return null } }))

import { buildMagicLinkUrl } from '@/lib/members/magic-link'
import { POST } from '@/app/api/members/auth/magic-link/request/route'
import MemberLoginPage from '@/app/(public)/cactus-account/login/page'
import LoginForm from '@/components/members/LoginForm'

const TOKEN = 'a'.repeat(64)

beforeEach(() => {
  vi.stubEnv('SITE_URL', 'https://example.test/')
  state.sent = []
  state.member = { id: 'm1', email: 'jo@example.com', password: null, passkeys: [] }
})

describe('buildMagicLinkUrl', () => {
  it('is unchanged when there is no redirect', () => {
    const expected = `https://example.test/account/login?magic_token=${TOKEN}`
    expect(buildMagicLinkUrl('https://example.test/', 'account', TOKEN)).toBe(expected)
    expect(buildMagicLinkUrl('https://example.test', 'account', TOKEN, null)).toBe(expected)
    expect(buildMagicLinkUrl('https://example.test', 'account', TOKEN, '')).toBe(expected)
  })

  it('appends a same-site redirect, encoded, query string and all', () => {
    const url = buildMagicLinkUrl('https://example.test', 'account', TOKEN, '/tgf/app-connect?state=S&redirect_uri=x')
    expect(url).toBe(
      `https://example.test/account/login?magic_token=${TOKEN}&redirect=%2Ftgf%2Fapp-connect%3Fstate%3DS%26redirect_uri%3Dx`,
    )
    const parsed = new URL(url)
    expect(parsed.searchParams.get('magic_token')).toBe(TOKEN)
    expect(parsed.searchParams.get('redirect')).toBe('/tgf/app-connect?state=S&redirect_uri=x')
  })

  // A native-app hand-off page carries its own callback in its query string.
  // Encoded, it survives the round trip intact; a literal "://" anywhere in the
  // path is refused by sanitizeRedirect, so callers must encode it.
  it('round-trips an already-encoded callback inside the redirect', () => {
    const target = '/tgf/app-connect?state=S&redirect_uri=tgfinance%3A%2F%2Fauth'
    const parsed = new URL(buildMagicLinkUrl('https://example.test', 'account', TOKEN, target))
    expect(parsed.searchParams.get('redirect')).toBe(target)
    expect(buildMagicLinkUrl('https://example.test', 'account', TOKEN, '/tgf/app-connect?redirect_uri=tgfinance://auth')).toBe(
      `https://example.test/account/login?magic_token=${TOKEN}`,
    )
  })

  it('leaves off anything that could send the member to another site', () => {
    for (const bad of ['https://evil.test/', '//evil.test', '/\\evil.test', 'evil.test', 'javascript:alert(1)', '/x?u=https://evil.test']) {
      expect(buildMagicLinkUrl('https://example.test', 'account', TOKEN, bad)).toBe(
        `https://example.test/account/login?magic_token=${TOKEN}`,
      )
    }
  })
})

const request = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/members/auth/magic-link/request', { method: 'POST', body: JSON.stringify(body) }))
const urlOf = (s?: { vars: { magicUrl?: string } }) => new URL(s?.vars.magicUrl ?? 'missing:')
const sentUrl = () => urlOf(state.sent[0])

describe('POST /api/members/auth/magic-link/request', () => {
  it('sends the same link as before when no redirect is given', async () => {
    expect(await (await request({ email: 'jo@example.com' })).json()).toEqual({ ok: true })
    expect(state.sent).toHaveLength(1)
    expect(state.sent[0]?.key).toBe('member.magic-link')
    expect(sentUrl().pathname).toBe('/account/login')
    expect([...sentUrl().searchParams.keys()]).toEqual(['magic_token'])
  })

  it('carries a same-site redirect into the emailed link', async () => {
    await request({ email: 'jo@example.com', redirectTo: '/tgf/app-connect?state=S' })
    expect(sentUrl().searchParams.get('redirect')).toBe('/tgf/app-connect?state=S')
  })

  it('drops an off-site redirect but still sends the link', async () => {
    await request({ email: 'jo@example.com', redirectTo: 'https://evil.test/steal' })
    expect(state.sent).toHaveLength(1)
    expect(sentUrl().searchParams.has('redirect')).toBe(false)
  })

  it('never lets a malformed redirect cost the member their link', async () => {
    await request({ email: 'jo@example.com', redirectTo: 42 })
    await request({ email: 'jo@example.com', redirectTo: `/${'x'.repeat(5000)}` })
    expect(state.sent).toHaveLength(2)
    for (const s of state.sent) expect(urlOf(s).searchParams.has('redirect')).toBe(false)
  })

  it('stays enumeration-safe: an unknown address gets the same reply and no link', async () => {
    state.member = null
    expect(await (await request({ email: 'nobody@example.com', redirectTo: '/x' })).json()).toEqual({ ok: true })
    expect(state.sent.map((s) => s.key)).toEqual(['member.not-registered'])
  })
})

// Pull the LoginForm element out of what the server page returned.
function findLoginForm(node: ReactNode): ReactElement<Record<string, unknown>> | null {
  if (!isValidElement(node)) return null
  if (node.type === LoginForm) return node as ReactElement<Record<string, unknown>>
  const children = (node.props as { children?: ReactNode }).children
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findLoginForm(child)
    if (found) return found
  }
  return null
}
const loginFormProps = async (params: Record<string, string>) =>
  findLoginForm(await MemberLoginPage({ searchParams: Promise.resolve(params) }))!.props

describe('member sign-in page', () => {
  it('hands the arriving redirect to the form for every method, the email link included', async () => {
    const props = await loginFormProps({ redirect: '/tgf/app-connect?state=S' })
    expect(props.redirectTo).toBe('/tgf/app-connect?state=S')
    expect(props.magicLinkRedirect).toBe('/tgf/app-connect?state=S')
  })

  it('asks for no email-link redirect when the visitor brought none', async () => {
    const props = await loginFormProps({})
    expect(props.redirectTo).toBe('/account')
    expect(props.magicLinkRedirect).toBeUndefined()
  })

  it('honours the redirect the email link comes back with, after the token signs in', async () => {
    const props = await loginFormProps({ magic_token: TOKEN, redirect: '/tgf/app-connect?state=S' })
    expect(props.magicToken).toBe(TOKEN)
    expect(props.redirectTo).toBe('/tgf/app-connect?state=S')
  })

  it('refuses an off-site redirect, from the email link or anywhere else', async () => {
    const props = await loginFormProps({ magic_token: TOKEN, redirect: 'https://evil.test/' })
    expect(props.redirectTo).toBe('/account')
  })

  it('will not loop a member back to a signed-out page', async () => {
    const props = await loginFormProps({ redirect: '/account/login' })
    expect(props.redirectTo).toBe('/account')
  })
})
