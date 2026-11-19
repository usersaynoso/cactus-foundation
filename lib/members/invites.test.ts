import { createHash } from 'crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// createMemberInvite is the admin invite route's body, lifted out so a module
// can mint an invite after its own permission check. The route must behave
// exactly as it did before the move: same stored row, same link, same reply.

const state = vi.hoisted(() => ({
  created: [] as Array<Record<string, unknown>>,
  user: null as null | { id: string; displayName: string | null; username: string },
  allowed: true,
}))

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    memberInvite: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.created.push(data)
        return { id: 'inv1', ...data }
      }),
    },
  },
}))
vi.mock('@/lib/members/paths', () => ({ getMemberAreaPath: () => 'account' }))
vi.mock('@/lib/auth/session', () => ({ getSessionFromCookie: async () => state.user }))
vi.mock('@/lib/permissions/check', () => ({ hasPermission: async () => state.allowed }))

import { createMemberInvite } from '@/lib/members/invites'
import { POST } from '@/app/api/admin/members/invites/route'

const NOW = new Date('2026-11-19T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const post = (body?: unknown) =>
  POST(new NextRequest('http://localhost/api/admin/members/invites', {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.stubEnv('SITE_URL', 'https://example.test/')
  state.created = []
  state.user = { id: 'u1', displayName: 'Chris', username: 'chris' }
  state.allowed = true
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('createMemberInvite', () => {
  it('stores only the hash and returns the one copy of the raw token', async () => {
    const out = await createMemberInvite({ createdById: 'u1', createdByName: 'Chris', expiresInDays: 3 })
    expect(out.token).toMatch(/^[0-9a-f]{64}$/)
    expect(out.inviteUrl).toBe(`https://example.test/account/register?invite=${out.token}`)
    expect(out.expiresAt).toEqual(new Date(NOW.getTime() + 3 * DAY))
    expect(state.created).toEqual([
      { tokenHash: sha256(out.token), createdById: 'u1', createdByName: 'Chris', expiresAt: out.expiresAt },
    ])
    expect(JSON.stringify(state.created)).not.toContain(out.token)
  })

  it('defaults to seven days and no staff user, for an invite a module makes', async () => {
    const out = await createMemberInvite({ createdByName: 'A member' })
    expect(out.expiresAt).toEqual(new Date(NOW.getTime() + 7 * DAY))
    expect(state.created[0]).toMatchObject({ createdById: null, createdByName: 'A member' })
  })

  it('refuses an expiry the admin route would have refused, before writing anything', async () => {
    for (const expiresInDays of [0, 366, 1.5, Number.NaN]) {
      await expect(createMemberInvite({ createdByName: 'x', expiresInDays })).rejects.toThrow(RangeError)
    }
    expect(state.created).toEqual([])
  })

  it('makes a different token every time', async () => {
    const a = await createMemberInvite({ createdByName: 'x' })
    const b = await createMemberInvite({ createdByName: 'x' })
    expect(a.token).not.toBe(b.token)
  })
})

describe('POST /api/admin/members/invites (unchanged behaviour)', () => {
  it('mints an invite as the signed-in admin and replies with the link and expiry only', async () => {
    const res = await post({ expiresInDays: 14 })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['expiresAt', 'inviteUrl'])
    const token = new URL(body.inviteUrl).searchParams.get('invite')!
    expect(body.inviteUrl).toBe(`https://example.test/account/register?invite=${token}`)
    expect(body.expiresAt).toBe(new Date(NOW.getTime() + 14 * DAY).toISOString())
    expect(state.created).toEqual([
      { tokenHash: sha256(token), createdById: 'u1', createdByName: 'Chris', expiresAt: new Date(NOW.getTime() + 14 * DAY) },
    ])
  })

  it('falls back to the username and seven days, as before', async () => {
    state.user = { id: 'u2', displayName: null, username: 'jo' }
    const res = await post()
    expect(res.status).toBe(200)
    expect(state.created[0]).toMatchObject({ createdById: 'u2', createdByName: 'jo', expiresAt: new Date(NOW.getTime() + 7 * DAY) })
  })

  it('still answers 401, 403 and 400 without minting anything', async () => {
    state.user = null
    expect((await post({})).status).toBe(401)
    state.user = { id: 'u1', displayName: 'Chris', username: 'chris' }
    state.allowed = false
    expect((await post({})).status).toBe(403)
    state.allowed = true
    expect((await post({ expiresInDays: 366 })).status).toBe(400)
    expect(state.created).toEqual([])
  })
})
