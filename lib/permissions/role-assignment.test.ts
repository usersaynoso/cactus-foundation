import { describe, it, expect, vi, beforeEach } from 'vitest'

const findMany = vi.fn()
vi.mock('@/lib/db/prisma', () => ({
  prisma: { rolePermission: { findMany: (...a: unknown[]) => findMany(...a) } },
}))

import { roleAssignmentRefusal, unassignableRoleIds } from './check'
import type { SessionUser } from '@/lib/auth/session'

const actor = (protectedRole: boolean) =>
  ({ id: 'u1', roleId: 'r-actor', role: { isProtected: protectedRole } }) as unknown as SessionUser

// First call: actor's permissions. Second call: the candidate roles' permissions.
function seed(mine: string[], theirs: { roleId: string; permissionKey: string }[]) {
  findMany.mockReset()
  findMany
    .mockResolvedValueOnce(mine.map((permissionKey) => ({ permissionKey })))
    .mockResolvedValueOnce(theirs)
}

describe('role assignment ceiling', () => {
  beforeEach(() => findMany.mockReset())

  it('allows a role whose permissions are a subset of the actor\'s', async () => {
    seed(['users.manage', 'pages.write'], [{ roleId: 'r1', permissionKey: 'pages.write' }])
    expect(await roleAssignmentRefusal(actor(false), { id: 'r1', isProtected: false })).toBeNull()
  })

  it('refuses a role holding a permission the actor lacks', async () => {
    seed(['users.manage'], [
      { roleId: 'r2', permissionKey: 'users.manage' },
      { roleId: 'r2', permissionKey: 'config.manage' },
    ])
    expect(await roleAssignmentRefusal(actor(false), { id: 'r2', isProtected: false })).toMatch(/permissions you do not hold/)
  })

  it('refuses a protected role for a non-admin', async () => {
    expect(await roleAssignmentRefusal(actor(false), { id: 'admin', isProtected: true })).toMatch(/Admin/)
  })

  it('does not restrict admins and does not query', async () => {
    expect(await roleAssignmentRefusal(actor(true), { id: 'r2', isProtected: false })).toBeNull()
    expect((await unassignableRoleIds(actor(true), [{ id: 'r2', isProtected: false }])).size).toBe(0)
    expect(findMany).not.toHaveBeenCalled()
  })

  it('reports blocked ids across a list', async () => {
    seed(['a'], [
      { roleId: 'ok', permissionKey: 'a' },
      { roleId: 'bad', permissionKey: 'b' },
    ])
    const blocked = await unassignableRoleIds(actor(false), [
      { id: 'ok', isProtected: false },
      { id: 'bad', isProtected: false },
    ])
    expect([...blocked]).toEqual(['bad'])
  })
})
