import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MEMBERS_CONFIG_DEFAULTS, isMemberSelfDeletionAllowed, parseMembersConfig } from '@/lib/members/config'

// allowMemberSelfDeletion: a site can leave deleting members to admins alone.
// Default on, so every site that never touches it behaves exactly as before.

const state = vi.hoisted(() => ({
  member: null as null | { id: string; userId: string | null },
  config: null as unknown,
  requested: [] as string[],
}))

vi.mock('@/lib/members/session', () => ({ getMemberFromCookie: async () => state.member }))
vi.mock('@/lib/members/deletion', () => ({
  requestMemberDeletion: async (id: string) => {
    state.requested.push(id)
    return new Date('2026-12-03T00:00:00Z')
  },
}))
vi.mock('@/lib/db/prisma', () => ({
  prisma: { siteConfig: { findUnique: async () => ({ membersConfig: state.config }) } },
}))

import { POST } from '@/app/api/members/delete-account/route'

beforeEach(() => {
  state.member = { id: 'm1', userId: null }
  state.config = { enabled: true }
  state.requested = []
})

describe('allowMemberSelfDeletion setting', () => {
  it('defaults to allowed, including for stored settings written before it existed', () => {
    expect(MEMBERS_CONFIG_DEFAULTS.allowMemberSelfDeletion).toBe(true)
    expect(isMemberSelfDeletionAllowed(parseMembersConfig({ enabled: true, deletionGracePeriodDays: 30 }))).toBe(true)
    expect(isMemberSelfDeletionAllowed(parseMembersConfig(null))).toBe(true)
  })

  it('reads an explicit false', () => {
    expect(isMemberSelfDeletionAllowed(parseMembersConfig({ allowMemberSelfDeletion: false }))).toBe(false)
  })

  it('is independent of the Danger zone section switch', () => {
    const config = parseMembersConfig({ accountSectionsEnabled: { dangerZone: false } })
    expect(isMemberSelfDeletionAllowed(config)).toBe(true)
  })
})

describe('POST /api/members/delete-account', () => {
  it('schedules the deletion by default, exactly as before', async () => {
    const res = await POST()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ scheduledAt: '2026-12-03T00:00:00.000Z' })
    expect(state.requested).toEqual(['m1'])
  })

  it('refuses with 403 and schedules nothing when the site has switched it off', async () => {
    state.config = { enabled: true, allowMemberSelfDeletion: false }
    const res = await POST()
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/closed by the team/)
    expect(state.requested).toEqual([])
  })

  it('still answers 401 to nobody, and the staff-linked refusal comes first', async () => {
    state.member = null
    expect((await POST()).status).toBe(401)
    state.member = { id: 'm2', userId: 'u1' }
    const res = await POST()
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/admin sign-in/)
    expect(state.requested).toEqual([])
  })
})
