import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Unsuspend only lifts a suspension. It used to set ACTIVE on whoever it was
// pointed at, so a registration still awaiting approval or email verification
// (or one already deleted) went straight to ACTIVE - one at a time, or a whole
// page at once through the bulk action.

type Row = { id: string; email: string; status: string }

const state = vi.hoisted(() => ({ rows: [] as Array<{ id: string; email: string; status: string }> }))

// Just enough of Prisma's unique-where matching: id, plus a status that is
// either a value or { not: value }.
function matches(row: Row, where: { id: string; status?: string | { not: string } }): boolean {
  if (row.id !== where.id) return false
  if (where.status === undefined) return true
  if (typeof where.status === 'string') return row.status === where.status
  return row.status !== where.status.not
}

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    member: {
      update: vi.fn(async ({ where, data }: { where: { id: string; status?: string | { not: string } }; data: Partial<Row> }) => {
        const row = state.rows.find((r) => matches(r, where))
        if (!row) throw new Error('Record to update not found.')
        Object.assign(row, data)
        return { ...row }
      }),
    },
    memberSession: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  },
}))
vi.mock('@/lib/auth/session', () => ({ getSessionFromCookie: async () => ({ id: 'admin1' }) }))
vi.mock('@/lib/permissions/check', () => ({ hasPermission: async () => true }))
vi.mock('@/lib/members/admin-log', () => ({ logMemberAdminAction: async () => {} }))
vi.mock('@/lib/members/member-deleted', () => ({ notifyMembersDeleting: async () => {} }))
vi.mock('@/lib/email/templates', () => ({ sendMemberEmail: async () => {} }))
vi.mock('@/lib/config/env', () => ({ isEmailConfigured: () => false }))

import { POST as unsuspend } from './[id]/unsuspend/route'
import { POST as suspend } from './[id]/suspend/route'
import { POST as bulk } from './bulk/route'

const statusOf = (id: string) => state.rows.find((r) => r.id === id)?.status

beforeEach(() => {
  state.rows = [
    { id: 'suspended', email: 's@example.com', status: 'SUSPENDED' },
    { id: 'pending', email: 'p@example.com', status: 'PENDING_APPROVAL' },
    { id: 'unverified', email: 'u@example.com', status: 'PENDING_VERIFICATION' },
    { id: 'deleted', email: 'd@example.com', status: 'DELETED' },
  ]
})

const call = (id: string) =>
  unsuspend(new Request(`http://localhost/api/admin/members/${id}/unsuspend`, { method: 'POST' }), { params: Promise.resolve({ id }) })

describe('unsuspend', () => {
  it('lifts a suspension', async () => {
    const res = await call('suspended')
    expect(res.status).toBe(200)
    expect(statusOf('suspended')).toBe('ACTIVE')
  })

  it('refuses a member who is not suspended, and leaves them as they were', async () => {
    for (const id of ['pending', 'unverified', 'deleted']) {
      const before = statusOf(id)
      const res = await call(id)
      expect(res.status).toBe(400)
      expect(statusOf(id)).toBe(before)
    }
  })

  it('bulk unsuspend only touches the suspended ones', async () => {
    const res = await bulk(new NextRequest('http://localhost/x', {
      method: 'POST',
      body: JSON.stringify({ ids: ['suspended', 'pending', 'unverified', 'deleted'], action: 'unsuspend' }),
    }))
    expect(await res.json()).toEqual({ done: 1, skipped: 3 })
    expect(statusOf('suspended')).toBe('ACTIVE')
    expect(statusOf('pending')).toBe('PENDING_APPROVAL')
    expect(statusOf('unverified')).toBe('PENDING_VERIFICATION')
    expect(statusOf('deleted')).toBe('DELETED')
  })
})

describe('suspend', () => {
  it('does not suspend over a deleted member', async () => {
    const res = await suspend(
      new NextRequest('http://localhost/api/admin/members/deleted/suspend', { method: 'POST', body: '{}' }),
      { params: Promise.resolve({ id: 'deleted' }) },
    )
    expect(res.status).toBe(404)
    expect(statusOf('deleted')).toBe('DELETED')
  })
})
