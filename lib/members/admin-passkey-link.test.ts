import { beforeEach, describe, expect, it, vi } from 'vitest'

const { member, user } = vi.hoisted(() => ({
  member: { findMany: vi.fn() },
  user: { findMany: vi.fn() },
}))
vi.mock('@/lib/db/prisma', () => ({ prisma: { member, user } }))

import {
  decideLinkedMember,
  isLinkedAdminPasskeyEnabled,
  memberHasLinkedAdminPasskey,
  normaliseLinkEmail,
  type LinkAdminUser,
  type LinkMemberCandidate,
} from './admin-passkey-link'
import { MEMBERS_CONFIG_DEFAULTS, parseMembersConfig } from './config'

const VERIFIED = new Date('2026-01-01T00:00:00Z')

const ADMIN: LinkAdminUser = {
  id: 'user_1',
  email: 'Chris@Example.com',
  emailVerifiedAt: VERIFIED,
  suspendedAt: null,
}

const MEMBER: LinkMemberCandidate = {
  id: 'member_1',
  email: 'chris@example.com',
  emailVerified: true,
  status: 'ACTIVE',
  userId: null,
}

describe('the setting', () => {
  it('is off by default, including for a stored config that predates it', () => {
    expect(MEMBERS_CONFIG_DEFAULTS.adminPasskeySignInForMembers).toBe(false)
    expect(parseMembersConfig({ enabled: true }).adminPasskeySignInForMembers).toBe(false)
    expect(isLinkedAdminPasskeyEnabled(parseMembersConfig({ enabled: true }))).toBe(false)
  })

  it('is on only with members on, member passkeys allowed and the switch on', () => {
    const on = parseMembersConfig({ enabled: true, adminPasskeySignInForMembers: true })
    expect(isLinkedAdminPasskeyEnabled(on)).toBe(true)
    expect(isLinkedAdminPasskeyEnabled({ ...on, enabled: false })).toBe(false)
    expect(
      isLinkedAdminPasskeyEnabled({ ...on, authMethodPolicies: { ...on.authMethodPolicies, PASSKEY: 'OFF' } })
    ).toBe(false)
    expect(
      isLinkedAdminPasskeyEnabled({ ...on, authMethodPolicies: { ...on.authMethodPolicies, PASSKEY: 'REQUIRED' } })
    ).toBe(true)
  })
})

describe('normaliseLinkEmail', () => {
  it('trims and lower-cases', () => {
    expect(normaliseLinkEmail('  Chris@Example.COM \n')).toBe('chris@example.com')
  })
})

describe('decideLinkedMember', () => {
  it('links the one verified, active member with the same address (case and spaces ignored)', () => {
    expect(decideLinkedMember(ADMIN, [MEMBER])).toEqual({ ok: true, memberId: 'member_1' })
    expect(decideLinkedMember(ADMIN, [{ ...MEMBER, email: ' CHRIS@example.com ' }])).toEqual({
      ok: true,
      memberId: 'member_1',
    })
  })

  it('links a member already tied to this same admin', () => {
    expect(decideLinkedMember(ADMIN, [{ ...MEMBER, userId: 'user_1' }])).toEqual({ ok: true, memberId: 'member_1' })
  })

  it('leaves a pending-approval member to the ordinary status check, as a member passkey would', () => {
    expect(decideLinkedMember(ADMIN, [{ ...MEMBER, status: 'PENDING_APPROVAL' }])).toEqual({
      ok: true,
      memberId: 'member_1',
    })
  })

  it('refuses when the admin address is not verified', () => {
    expect(decideLinkedMember({ ...ADMIN, emailVerifiedAt: null }, [MEMBER])).toEqual({
      ok: false,
      reason: 'admin_unverified',
    })
  })

  it('refuses a suspended admin', () => {
    expect(decideLinkedMember({ ...ADMIN, suspendedAt: VERIFIED }, [MEMBER])).toEqual({
      ok: false,
      reason: 'admin_suspended',
    })
  })

  it('refuses when no member has the address', () => {
    expect(decideLinkedMember(ADMIN, [])).toEqual({ ok: false, reason: 'no_member' })
    // A generous lookup cannot widen the match.
    expect(decideLinkedMember(ADMIN, [{ ...MEMBER, email: 'chris@example.co' }])).toEqual({
      ok: false,
      reason: 'no_member',
    })
    expect(decideLinkedMember({ ...ADMIN, email: '   ' }, [MEMBER])).toEqual({ ok: false, reason: 'no_member' })
  })

  it('refuses when more than one member matches', () => {
    expect(
      decideLinkedMember(ADMIN, [MEMBER, { ...MEMBER, id: 'member_2', email: 'CHRIS@EXAMPLE.COM' }])
    ).toEqual({ ok: false, reason: 'ambiguous' })
  })

  it('refuses a member whose address is not verified', () => {
    expect(decideLinkedMember(ADMIN, [{ ...MEMBER, emailVerified: false }])).toEqual({
      ok: false,
      reason: 'member_unverified',
    })
    expect(decideLinkedMember(ADMIN, [{ ...MEMBER, status: 'PENDING_VERIFICATION' }])).toEqual({
      ok: false,
      reason: 'member_unverified',
    })
  })

  it('refuses a suspended or deleted member', () => {
    expect(decideLinkedMember(ADMIN, [{ ...MEMBER, status: 'SUSPENDED' }])).toEqual({
      ok: false,
      reason: 'member_unavailable',
    })
    expect(decideLinkedMember(ADMIN, [{ ...MEMBER, status: 'DELETED' }])).toEqual({
      ok: false,
      reason: 'member_unavailable',
    })
  })

  it('refuses a member tied to a different admin', () => {
    expect(decideLinkedMember(ADMIN, [{ ...MEMBER, userId: 'user_2' }])).toEqual({
      ok: false,
      reason: 'linked_elsewhere',
    })
  })
})

describe('memberHasLinkedAdminPasskey', () => {
  const adminRow = { ...ADMIN, passkeys: [{ id: 'pk_1' }] }

  beforeEach(() => {
    vi.clearAllMocks()
    user.findMany.mockResolvedValue([adminRow])
    member.findMany.mockResolvedValue([MEMBER])
  })

  it('is true for a linkable member whose admin holds a passkey', async () => {
    expect(await memberHasLinkedAdminPasskey(MEMBER)).toBe(true)
    expect(user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: { equals: 'chris@example.com', mode: 'insensitive' } } })
    )
  })

  it('is false when the admin has no passkey', async () => {
    user.findMany.mockResolvedValue([{ ...adminRow, passkeys: [] }])
    expect(await memberHasLinkedAdminPasskey(MEMBER)).toBe(false)
  })

  it('is false with no admin, or two admins, behind the address', async () => {
    user.findMany.mockResolvedValue([])
    expect(await memberHasLinkedAdminPasskey(MEMBER)).toBe(false)
    user.findMany.mockResolvedValue([adminRow, { ...adminRow, id: 'user_2' }])
    expect(await memberHasLinkedAdminPasskey(MEMBER)).toBe(false)
  })

  it('applies the same refusals as sign-in', async () => {
    user.findMany.mockResolvedValue([{ ...adminRow, emailVerifiedAt: null }])
    expect(await memberHasLinkedAdminPasskey(MEMBER)).toBe(false)

    user.findMany.mockResolvedValue([adminRow])
    member.findMany.mockResolvedValue([{ ...MEMBER, emailVerified: false }])
    expect(await memberHasLinkedAdminPasskey({ ...MEMBER, emailVerified: false })).toBe(false)

    member.findMany.mockResolvedValue([MEMBER, { ...MEMBER, id: 'member_2' }])
    expect(await memberHasLinkedAdminPasskey(MEMBER)).toBe(false)
  })
})
