import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// core.member-deleted: modules hear about a member just before core deletes
// them, by every door core deletes through, and can never stop it happening.

type Row = { id: string; email: string; status: string; deletionScheduledAt: Date | null; username: string }

const state = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  manifests: [] as Array<{ manifest: unknown }>,
  map: {} as Record<string, Record<string, unknown>>,
  log: [] as string[],
  findManyFails: false,
}))
const rows = () => state.rows as Row[]

// Just enough of Prisma's where-matching for the conditions core deletes by.
function matches(row: Row, where: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    const value = (row as Record<string, unknown>)[key]
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as { lte?: Date; in?: string[] }
      if (c.lte && !(value instanceof Date && value <= c.lte)) return false
      if (c.in && !c.in.includes(value as string)) return false
    } else if (value !== cond) {
      return false
    }
  }
  return true
}

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    member: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (state.findManyFails) throw new Error('db down')
        state.log.push('lookup')
        return rows().filter((r) => matches(r, where)).map((r) => ({ id: r.id, email: r.email }))
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => rows().find((r) => r.id === where.id) ?? null),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const i = rows().findIndex((r) => r.id === where.id)
        if (i < 0) throw new Error('not found')
        state.log.push(`delete:${where.id}`)
        return rows().splice(i, 1)[0]
      }),
      deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const gone = rows().filter((r) => matches(r, where))
        state.rows = rows().filter((r) => !gone.includes(r))
        for (const r of gone) state.log.push(`delete:${r.id}`)
        return { count: gone.length }
      }),
    },
    module: { findMany: vi.fn(async () => state.manifests) },
  },
}))
vi.mock('@/lib/modules/live-status', () => ({ INSTALLED_MODULE_WHERE: {} }))
vi.mock('@/lib/modules/extension-points.server', () => ({
  get moduleServerExtensionPointComponents() { return state.map },
}))
vi.mock('@/lib/auth/session', () => ({ getSessionFromCookie: async () => ({ id: 'admin1' }) }))
vi.mock('@/lib/permissions/check', () => ({ hasPermission: async () => true }))
vi.mock('@/lib/members/admin-log', () => ({ logMemberAdminAction: async () => {} }))
vi.mock('@/lib/members/config', () => ({ getMembersConfig: async () => ({}) }))
vi.mock('@/lib/members/admin-notify', () => ({ notifyAdminMemberDeletionRequested: async () => {} }))
vi.mock('@/lib/email/templates', () => ({ sendMemberEmail: async () => {} }))
vi.mock('@/lib/config/env', () => ({ isEmailConfigured: () => false }))

import { HANDLER_TIMEOUT_MS, notifyMembersDeleting } from '@/lib/members/member-deleted'
import { purgeScheduledDeletions } from '@/lib/members/deletion'
import { DELETE as adminDelete } from '@/app/api/admin/members/[id]/route'
import { POST as adminReject } from '@/app/api/admin/members/[id]/reject/route'
import { POST as bulk } from '@/app/api/admin/members/bulk/route'

const POINT = 'core.member-deleted'
const installed = (...ids: string[]) => ids.map((id) => ({ manifest: { extensionPoints: [{ point: POINT, id }] } }))
const PAST = new Date('2026-01-01')
const FUTURE = new Date('2999-01-01')
const row = (id: string, over: Partial<Row> = {}): Row => ({
  id, email: `${id}@example.com`, status: 'ACTIVE', deletionScheduledAt: null, username: id, ...over,
})

// A subscriber that records what it was told, and whether the row still existed.
function subscribe(id = 'a') {
  const seen: Array<{ memberId: string; email: string; stillThere: boolean }> = []
  state.map = { [POINT]: { ...(state.map[POINT] ?? {}), [id]: vi.fn(async (e: { memberId: string; email: string }) => {
    state.log.push(`notify:${e.memberId}`)
    seen.push({ ...e, stillThere: rows().some((r) => r.id === e.memberId) })
  }) } }
  state.manifests = [...state.manifests, ...installed(id)]
  return seen
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  state.rows = [row('m1'), row('m2')]
  state.manifests = []
  state.map = {}
  state.log = []
  state.findManyFails = false
})
afterEach(() => {
  vi.useRealTimers()
})

describe('notifyMembersDeleting', () => {
  it('does nothing at all, not even a lookup, when no module subscribes', async () => {
    expect(await notifyMembersDeleting({ id: 'm1' })).toBeNull()
    expect(state.log).toEqual([])
  })

  it('skips a module that is compiled in but no longer installed', async () => {
    const handler = vi.fn(async () => {})
    state.map = { [POINT]: { a: handler } }
    expect(await notifyMembersDeleting({ id: 'm1' })).toBeNull()
    expect(handler).not.toHaveBeenCalled()
  })

  it('hands each subscriber the id and email of every member about to go', async () => {
    const seen = subscribe()
    expect(await notifyMembersDeleting({ status: 'ACTIVE' })).toEqual(['m1', 'm2'])
    expect(seen).toEqual([
      { memberId: 'm1', email: 'm1@example.com', stillThere: true },
      { memberId: 'm2', email: 'm2@example.com', stillThere: true },
    ])
  })

  it('never throws, and one failing module does not stop the next', async () => {
    state.map = { [POINT]: { a: vi.fn(async () => { throw new Error('boom') }) } }
    state.manifests = installed('a')
    const seen = subscribe('b')
    await expect(notifyMembersDeleting({ id: 'm1' })).resolves.toEqual(['m1'])
    expect(seen).toHaveLength(1)
    expect(console.error).toHaveBeenCalled()
  })

  it('survives a handler that throws synchronously', async () => {
    state.map = { [POINT]: { a: () => { throw new Error('sync boom') } } }
    state.manifests = installed('a')
    await expect(notifyMembersDeleting({ id: 'm1' })).resolves.toEqual(['m1'])
  })

  it('stops waiting for a handler that hangs', async () => {
    vi.useFakeTimers()
    state.map = { [POINT]: { a: vi.fn(() => new Promise<void>(() => {})) } }
    state.manifests = installed('a')
    const done = notifyMembersDeleting({ id: 'm1' })
    await vi.advanceTimersByTimeAsync(HANDLER_TIMEOUT_MS + 1)
    await expect(done).resolves.toEqual(['m1'])
  })

  it('returns null and lets the deletion go ahead if the lookup itself fails', async () => {
    subscribe()
    state.findManyFails = true
    await expect(notifyMembersDeleting({ id: 'm1' })).resolves.toBeNull()
  })
})

describe('every door core deletes a member through', () => {
  it('admin delete: announced, then deleted', async () => {
    const seen = subscribe()
    const res = await adminDelete(new NextRequest('http://localhost/x', { method: 'DELETE' }), { params: Promise.resolve({ id: 'm1' }) })
    expect(res.status).toBe(200)
    expect(seen).toEqual([{ memberId: 'm1', email: 'm1@example.com', stillThere: true }])
    expect(state.log).toEqual(['lookup', 'notify:m1', 'delete:m1'])
  })

  it('admin delete: a failing module does not stop it', async () => {
    state.map = { [POINT]: { a: vi.fn(async () => { throw new Error('boom') }) } }
    state.manifests = installed('a')
    const res = await adminDelete(new NextRequest('http://localhost/x', { method: 'DELETE' }), { params: Promise.resolve({ id: 'm1' }) })
    expect(res.status).toBe(200)
    expect(rows().map((r) => r.id)).toEqual(['m2'])
  })

  it('reject: announces only a member actually awaiting approval', async () => {
    const seen = subscribe()
    state.rows = [row('m1', { status: 'PENDING_APPROVAL' }), row('m2')]
    const ok = await adminReject(new Request('http://localhost/x', { method: 'POST' }), { params: Promise.resolve({ id: 'm1' }) })
    expect(ok.status).toBe(200)
    const no = await adminReject(new Request('http://localhost/x', { method: 'POST' }), { params: Promise.resolve({ id: 'm2' }) })
    expect(no.status).toBe(400)
    expect(seen.map((s) => s.memberId)).toEqual(['m1'])
    expect(rows().map((r) => r.id)).toEqual(['m2'])
  })

  it('bulk delete and bulk reject: each member announced before it goes', async () => {
    const seen = subscribe()
    state.rows = [row('m1'), row('m2'), row('m3', { status: 'PENDING_APPROVAL' })]
    const del = await bulk(new NextRequest('http://localhost/x', { method: 'POST', body: JSON.stringify({ ids: ['m1', 'm2'], action: 'delete' }) }))
    expect(await del.json()).toEqual({ done: 2, skipped: 0 })
    const rej = await bulk(new NextRequest('http://localhost/x', { method: 'POST', body: JSON.stringify({ ids: ['m3'], action: 'reject' }) }))
    expect(await rej.json()).toEqual({ done: 1, skipped: 0 })
    expect(seen.every((s) => s.stillThere)).toBe(true)
    expect(state.log.filter((l) => !l.startsWith('lookup'))).toEqual(['notify:m1', 'delete:m1', 'notify:m2', 'delete:m2', 'notify:m3', 'delete:m3'])
  })

  it('purge cron (self-requested deletions): announces the due members only, then deletes exactly those', async () => {
    const seen = subscribe()
    state.rows = [row('m1', { deletionScheduledAt: PAST }), row('m2', { deletionScheduledAt: FUTURE }), row('m3')]
    expect(await purgeScheduledDeletions()).toBe(1)
    expect(seen.map((s) => s.memberId)).toEqual(['m1'])
    expect(rows().map((r) => r.id)).toEqual(['m2', 'm3'])
  })

  it('purge cron: somebody who cancels while the handlers run is not deleted', async () => {
    state.rows = [row('m1', { deletionScheduledAt: PAST }), row('m2', { deletionScheduledAt: PAST })]
    state.map = { [POINT]: { a: vi.fn(async (e: { memberId: string }) => {
      if (e.memberId === 'm1') rows().find((r) => r.id === 'm2')!.deletionScheduledAt = null
    }) } }
    state.manifests = installed('a')
    expect(await purgeScheduledDeletions()).toBe(1)
    expect(rows().map((r) => r.id)).toEqual(['m2'])
  })

  it('purge cron: with no subscriber, the same single delete as ever', async () => {
    state.rows = [row('m1', { deletionScheduledAt: PAST }), row('m2', { deletionScheduledAt: FUTURE })]
    expect(await purgeScheduledDeletions()).toBe(1)
    expect(state.log).toEqual(['delete:m1'])
  })
})
