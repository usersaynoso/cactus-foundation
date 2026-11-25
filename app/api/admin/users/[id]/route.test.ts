import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  actor: { id: 'actor', roleId: 'r-actor', role: { isProtected: false } } as Record<string, unknown>,
  target: null as Record<string, unknown> | null,
  perms: {} as Record<string, string[]>,
  update: vi.fn(),
  del: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({ getSessionFromCookie: async () => h.actor }))
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: {
      findUnique: async () => h.target,
      update: (...a: unknown[]) => h.update(...a),
      delete: (...a: unknown[]) => h.del(...a),
    },
    role: { findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id, isProtected: false }) },
    rolePermission: {
      findUnique: async () => ({ x: 1 }),
      findMany: async ({ where }: { where: { roleId: string | { in: string[] } } }) => {
        const ids = typeof where.roleId === 'string' ? [where.roleId] : where.roleId.in
        return ids.flatMap((roleId) => (h.perms[roleId] ?? []).map((permissionKey) => ({ roleId, permissionKey })))
      },
    },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({ infoPage: { updateMany: vi.fn() }, media: { updateMany: vi.fn() }, user: { delete: h.del } }),
  },
}))

import { PATCH, DELETE } from './route'

const params = { params: Promise.resolve({ id: 'target' }) }
const req = (body: unknown) => ({ json: async () => body }) as never

function setTarget(roleId: string) {
  h.target = { id: 'target', roleId, role: { id: roleId, isProtected: false } }
}

describe('managing a colleague with a more powerful role', () => {
  beforeEach(() => {
    h.update.mockReset()
    h.del.mockReset()
    h.actor = { id: 'actor', roleId: 'r-actor', role: { isProtected: false } }
    h.perms = { 'r-actor': ['users.manage'], weak: ['users.manage'], strong: ['users.manage', 'config.manage'] }
  })

  it('refuses suspend, role change and delete on a stronger target', async () => {
    setTarget('strong')
    expect((await PATCH(req({ suspend: true }), params)).status).toBe(403)
    expect((await PATCH(req({ roleId: 'weak' }), params)).status).toBe(403)
    expect((await DELETE(req({}), params)).status).toBe(403)
    expect(h.update).not.toHaveBeenCalled()
    expect(h.del).not.toHaveBeenCalled()
  })

  it('allows the same actions on an equal or weaker target', async () => {
    setTarget('weak')
    expect((await PATCH(req({ suspend: true }), params)).status).toBe(200)
    expect((await DELETE(req({}), params)).status).toBe(200)
    expect(h.update).toHaveBeenCalled()
    expect(h.del).toHaveBeenCalled()
  })

  it('does not restrict admins', async () => {
    h.actor = { id: 'actor', roleId: 'r-admin', role: { isProtected: true } }
    setTarget('strong')
    expect((await PATCH(req({ suspend: true }), params)).status).toBe(200)
  })
})
