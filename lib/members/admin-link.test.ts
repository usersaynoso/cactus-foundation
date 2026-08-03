import { beforeEach, describe, expect, it, vi } from 'vitest'

const { member, memberSession } = vi.hoisted(() => ({
  member: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
  memberSession: { count: vi.fn() },
}))

vi.mock('@/lib/db/prisma', () => ({ prisma: { member, memberSession } }))
vi.mock('@/lib/members/default-role', () => ({ getOrCreateMembersRoleId: async () => 'role_members' }))
vi.mock('@/lib/members/registration', () => ({
  isUsernameFormatValid: (u: string) => /^[a-z0-9_-]{2,32}$/.test(u),
  isUsernameAvailable: async (u: string) => u !== 'taken',
  generateUsernameFromEmail: async () => 'generated1234',
}))

import { findOrCreateMemberForUser, tooManyRecentSessions } from './admin-link'

const STAFF = { id: 'user_1', email: 'chris@example.com', username: 'chris', displayName: 'Chris' }

// findUnique is called with { where: { userId } } first, then { where: { email } }.
function existing(opts: { byUserId?: unknown; byEmail?: unknown }) {
  member.findUnique.mockImplementation(async ({ where }: { where: { userId?: string; email?: string } }) =>
    where.userId !== undefined ? (opts.byUserId ?? null) : (opts.byEmail ?? null)
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  existing({})
  member.create.mockResolvedValue({ id: 'member_new' })
  member.update.mockResolvedValue({ id: 'member_existing' })
})

describe('findOrCreateMemberForUser', () => {
  it('returns the member already linked to this staff account', async () => {
    existing({ byUserId: { id: 'member_linked', status: 'ACTIVE' } })
    expect(await findOrCreateMemberForUser(STAFF)).toEqual({ ok: true, memberId: 'member_linked' })
    expect(member.create).not.toHaveBeenCalled()
  })

  it('refuses a linked member that is not active', async () => {
    existing({ byUserId: { id: 'member_linked', status: 'SUSPENDED' } })
    expect(await findOrCreateMemberForUser(STAFF)).toEqual({ ok: false, reason: 'unavailable' })
  })

  // Member.email is unique, so a second row for the same address is impossible
  // anyway - adopting the existing one is the only thing that can work.
  it('adopts an unlinked member with the same email and activates it', async () => {
    existing({ byEmail: { id: 'member_existing', status: 'PENDING_VERIFICATION', userId: null } })
    expect(await findOrCreateMemberForUser(STAFF)).toEqual({ ok: true, memberId: 'member_existing' })
    expect(member.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'member_existing' },
        data: expect.objectContaining({ userId: 'user_1', status: 'ACTIVE', emailVerified: true }),
      })
    )
  })

  it('will not adopt a suspended member', async () => {
    existing({ byEmail: { id: 'member_existing', status: 'SUSPENDED', userId: null } })
    expect(await findOrCreateMemberForUser(STAFF)).toEqual({ ok: false, reason: 'unavailable' })
    expect(member.update).not.toHaveBeenCalled()
  })

  it('will not steal a member already linked to a different staff account', async () => {
    existing({ byEmail: { id: 'member_existing', status: 'ACTIVE', userId: 'user_2' } })
    expect(await findOrCreateMemberForUser(STAFF)).toEqual({ ok: false, reason: 'unavailable' })
    expect(member.update).not.toHaveBeenCalled()
  })

  it('creates an active, verified member keyed to the staff account', async () => {
    expect(await findOrCreateMemberForUser(STAFF)).toEqual({ ok: true, memberId: 'member_new' })
    expect(member.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'chris@example.com',
          username: 'chris',
          status: 'ACTIVE',
          emailVerified: true,
          userId: 'user_1',
          roleId: 'role_members',
        }),
      })
    )
  })

  it('generates a handle when the staff username is taken on the member side', async () => {
    await findOrCreateMemberForUser({ ...STAFF, username: 'taken' })
    expect(member.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ username: 'generated1234' }) })
    )
  })
})

// The cookie-free half of the loop guard: a browser keeping nothing at all
// would otherwise be handed a session on every bounce, for ever.
describe('tooManyRecentSessions', () => {
  it('is false while sessions are still being kept', async () => {
    memberSession.count.mockResolvedValue(2)
    expect(await tooManyRecentSessions('member_1')).toBe(false)
  })

  it('is true once three have gone out inside the window', async () => {
    memberSession.count.mockResolvedValue(3)
    expect(await tooManyRecentSessions('member_1')).toBe(true)
  })

  it('only counts recent ones', async () => {
    memberSession.count.mockResolvedValue(0)
    await tooManyRecentSessions('member_1')
    expect(memberSession.count).toHaveBeenCalledWith({
      where: { memberId: 'member_1', createdAt: { gt: expect.any(Date) } },
    })
  })
})
