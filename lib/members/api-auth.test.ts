import { beforeEach, describe, expect, it, vi } from 'vitest'

// core.member-api-auth: a module's Bearer token can stand in for the member
// cookie on the account routes, but only through a resolver the module
// registered, only for an installed module, only for an ACTIVE member, and
// never ahead of a real cookie session.

const state = vi.hoisted(() => ({
  cookieMember: null as null | Record<string, unknown>,
  members: {} as Record<string, Record<string, unknown>>,
  manifests: [] as Array<{ manifest: unknown }>,
  map: {} as Record<string, Record<string, unknown>>,
  blocked: false,
  recorded: [] as string[][],
  checked: [] as string[][],
}))

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    member: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => state.members[where.id] ?? null) },
  },
}))
vi.mock('@/lib/members/session', () => ({ getMemberFromCookie: async () => state.cookieMember }))
vi.mock('@/lib/modules/live-status', () => ({ getInstalledManifests: async () => state.manifests }))
vi.mock('@/lib/modules/extension-points.server', () => ({
  get moduleServerExtensionPointComponents() {
    return state.map
  },
}))
vi.mock('@/lib/config/site', () => ({ isBehindCloudflare: async () => false }))
vi.mock('@/lib/auth/rate-limit', () => ({
  clientIpFromHeaders: () => '203.0.113.9',
  checkRateLimit: vi.fn(async (_action: string, keys: string[]) => {
    state.checked.push(keys)
    return { allowed: !state.blocked }
  }),
  recordAttempt: vi.fn(async (_action: string, keys: string[]) => {
    state.recorded.push(keys)
  }),
}))

import { bearerToken, getMemberAuthFromRequest, getMemberFromRequest, RESOLVER_TIMEOUT_MS } from '@/lib/members/api-auth'

const ACTIVE = { id: 'm1', email: 'chris@example.com', status: 'ACTIVE', username: 'chris' }
const GOOD = 'tgfd_' + 'a'.repeat(43)

function req(headers: Record<string, string> = {}) {
  return new Request('https://example.test/api/members/profile', { headers })
}
const bearer = (token = GOOD) => req({ authorization: `Bearer ${token}` })

function install(resolve: unknown, opts: { name?: string; id?: string; installed?: boolean } = {}) {
  const name = opts.name ?? 'tg-finance'
  const id = opts.id ?? 'tg-finance-api-auth'
  state.map['core.member-api-auth'] = { ...(state.map['core.member-api-auth'] ?? {}), [id]: resolve }
  if (opts.installed !== false) {
    state.manifests.push({ manifest: { name, extensionPoints: [{ point: 'core.member-api-auth', id }] } })
  }
}

beforeEach(() => {
  state.cookieMember = null
  state.members = { m1: { ...ACTIVE } }
  state.manifests = []
  state.map = {}
  state.blocked = false
  state.recorded = []
  state.checked = []
  vi.useRealTimers()
})

describe('bearerToken', () => {
  it('reads a Bearer token and nothing else', () => {
    expect(bearerToken(bearer())).toBe(GOOD)
    expect(bearerToken(req({ authorization: `bearer   ${GOOD}  ` }))).toBe(GOOD)
    expect(bearerToken(req({ authorization: `Basic ${GOOD}` }))).toBeNull()
    expect(bearerToken(req({ authorization: 'Bearer ' }))).toBeNull()
    expect(bearerToken(req({ authorization: `Bearer ${'x'.repeat(513)}` }))).toBeNull()
    expect(bearerToken(req({ authorization: 'Bearer two words' }))).toBeNull()
    expect(bearerToken(req())).toBeNull()
  })
})

describe('getMemberAuthFromRequest', () => {
  it('a cookie session wins, and the resolvers are never asked', async () => {
    const resolve = vi.fn(async () => ({ memberId: 'm1', credentialId: 'd1' }))
    install(resolve)
    state.cookieMember = { ...ACTIVE, id: 'cookie-member' }
    const auth = await getMemberAuthFromRequest(bearer())
    expect(auth).toEqual({ via: 'cookie', member: state.cookieMember })
    expect(resolve).not.toHaveBeenCalled()
  })

  it('no cookie and no Bearer: nobody, and nothing counted', async () => {
    install(vi.fn())
    expect(await getMemberAuthFromRequest(req())).toBeNull()
    expect(state.recorded).toEqual([])
  })

  it('a live token from an installed module names the member and the credential', async () => {
    const resolve = vi.fn(async () => ({ memberId: 'm1', credentialId: 'dev-1', label: "  Chris's iPhone  " }))
    install(resolve)
    const request = bearer()
    const auth = await getMemberAuthFromRequest(request)
    expect(auth).toEqual({
      via: 'token',
      member: state.members.m1,
      moduleName: 'tg-finance',
      credentialId: 'dev-1',
      label: "Chris's iPhone",
    })
    expect(resolve).toHaveBeenCalledWith(GOOD, request)
    expect(state.recorded).toEqual([])
    expect(await getMemberFromRequest(bearer())).toEqual(state.members.m1)
  })

  it('with no resolver registered at all a Bearer token is simply not a sign-in, and costs no lookups', async () => {
    expect(await getMemberAuthFromRequest(bearer())).toBeNull()
    expect(state.checked).toEqual([])
    expect(state.recorded).toEqual([])
  })

  it('a resolver from a module that is built but not installed is never asked', async () => {
    const resolve = vi.fn(async () => ({ memberId: 'm1', credentialId: 'd1' }))
    install(resolve, { installed: false })
    expect(await getMemberAuthFromRequest(bearer())).toBeNull()
    expect(resolve).not.toHaveBeenCalled()
  })

  it('a token nobody recognises is counted against the address', async () => {
    install(vi.fn(async () => null))
    expect(await getMemberAuthFromRequest(bearer())).toBeNull()
    expect(state.recorded).toEqual([['ip:203.0.113.9']])
  })

  it('over the limit, the resolvers are not even shown the token', async () => {
    const resolve = vi.fn(async () => ({ memberId: 'm1', credentialId: 'd1' }))
    install(resolve)
    state.blocked = true
    expect(await getMemberAuthFromRequest(bearer())).toBeNull()
    expect(resolve).not.toHaveBeenCalled()
  })

  it('asks each resolver in turn; the first to recognise the token wins', async () => {
    const first = vi.fn(async () => null)
    const second = vi.fn(async () => ({ memberId: 'm1', credentialId: 'd2' }))
    install(first, { name: 'other-module', id: 'other' })
    install(second)
    const auth = await getMemberAuthFromRequest(bearer())
    expect(first).toHaveBeenCalled()
    expect(auth).toMatchObject({ via: 'token', moduleName: 'tg-finance', credentialId: 'd2' })
  })

  it('a resolver that throws is skipped and logged, not a 500', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    install(vi.fn(async () => {
      throw new Error('db down')
    }), { name: 'broken', id: 'broken' })
    install(vi.fn(async () => ({ memberId: 'm1', credentialId: 'd1' })))
    expect(await getMemberAuthFromRequest(bearer())).toMatchObject({ via: 'token', credentialId: 'd1' })
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it('a resolver that never answers is given up on', async () => {
    vi.useFakeTimers()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    install(vi.fn(() => new Promise(() => {})))
    const pending = getMemberAuthFromRequest(bearer())
    await vi.advanceTimersByTimeAsync(RESOLVER_TIMEOUT_MS + 10)
    expect(await pending).toBeNull()
    error.mockRestore()
  })

  it('an answer that is not a credential is ignored', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const bad of [{ memberId: 'm1' }, { memberId: '', credentialId: 'd' }, { memberId: 'm1', credentialId: 'x'.repeat(201) }, 'm1', true]) {
      state.map = {}
      state.manifests = []
      install(vi.fn(async () => bad))
      expect(await getMemberAuthFromRequest(bearer())).toBeNull()
    }
    error.mockRestore()
  })

  it('a member who is not ACTIVE is nobody, however good the token', async () => {
    install(vi.fn(async () => ({ memberId: 'm1', credentialId: 'd1' })))
    for (const status of ['SUSPENDED', 'PENDING_VERIFICATION', 'PENDING_APPROVAL', 'DELETED']) {
      state.members.m1 = { ...ACTIVE, status }
      expect(await getMemberAuthFromRequest(bearer())).toBeNull()
    }
    state.members = {}
    expect(await getMemberAuthFromRequest(bearer())).toBeNull()
  })
})
