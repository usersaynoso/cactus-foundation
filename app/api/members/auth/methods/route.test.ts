import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// The identifier-first sign-in form asks this route which buttons to show. With
// "Admins can use their admin passkey to sign in to their member account" on,
// a member whose address belongs to an admin with a passkey is offered the
// passkey button; an address with no member behind it still gets the plain
// link-only answer, whether or not an admin holds it.

const db = vi.hoisted(() => ({
  membersConfig: {} as Record<string, unknown>,
  member: null as null | Record<string, unknown>,
  users: [] as Array<Record<string, unknown>>,
  memberCandidates: [] as Array<Record<string, unknown>>,
}))

const { userFindMany } = vi.hoisted(() => ({ userFindMany: vi.fn() }))

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    siteConfig: { findUnique: vi.fn(async () => ({ membersConfig: db.membersConfig })) },
    member: {
      findUnique: vi.fn(async () => db.member),
      findMany: vi.fn(async () => db.memberCandidates),
    },
    user: { findMany: userFindMany },
  },
}))
vi.mock('@/lib/auth/rate-limit', () => ({
  checkAndRecord: async () => ({ allowed: true }),
  getClientIp: async () => '127.0.0.1',
}))
vi.mock('@/lib/config/env', () => ({ isEmailConfigured: () => true }))

import { POST } from './route'

const MEMBER = {
  id: 'member_1',
  email: 'chris@example.com',
  emailVerified: true,
  status: 'ACTIVE',
  userId: null,
  password: null,
  passkeys: [],
}

async function methodsFor(email: string) {
  const res = await POST(
    new NextRequest('https://example.test/api/members/auth/methods', {
      method: 'POST',
      body: JSON.stringify({ email }),
      headers: { 'content-type': 'application/json' },
    })
  )
  return res.json()
}

const LINK_ONLY = { passkey: false, password: false, magicLink: true }
const PASSKEY = { passkey: true, password: false, magicLink: false }

beforeEach(() => {
  vi.clearAllMocks()
  db.membersConfig = { enabled: true, adminPasskeySignInForMembers: true }
  db.member = { ...MEMBER }
  db.memberCandidates = [{ ...MEMBER }]
  userFindMany.mockImplementation(async () => [
    { id: 'user_1', email: 'chris@example.com', emailVerifiedAt: new Date(), suspendedAt: null, passkeys: [{ id: 'pk_1' }] },
  ])
})

describe('POST /api/members/auth/methods with the linked admin passkey setting', () => {
  it('offers the passkey to a member whose admin account holds one', async () => {
    expect(await methodsFor('chris@example.com')).toEqual(PASSKEY)
  })

  it('setting off: unchanged, and the admin table is never asked', async () => {
    db.membersConfig = { enabled: true }
    expect(await methodsFor('chris@example.com')).toEqual(LINK_ONLY)
    expect(userFindMany).not.toHaveBeenCalled()
  })

  it('an address with no member gets link-only and never asks the admin table', async () => {
    db.member = null
    expect(await methodsFor('chris@example.com')).toEqual(LINK_ONLY)
    expect(userFindMany).not.toHaveBeenCalled()
  })

  it('a member with a passkey of their own is answered without the admin lookup', async () => {
    db.member = { ...MEMBER, passkeys: [{ id: 'mpk_1' }] }
    expect(await methodsFor('chris@example.com')).toEqual(PASSKEY)
    expect(userFindMany).not.toHaveBeenCalled()
  })

  it('a member the link rules refuse is not offered the admin passkey', async () => {
    db.memberCandidates = [{ ...MEMBER, emailVerified: false }]
    db.member = { ...MEMBER, emailVerified: false }
    expect(await methodsFor('chris@example.com')).toEqual(LINK_ONLY)
  })
})
