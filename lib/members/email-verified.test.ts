import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  member: null as null | { id: string; email: string; emailVerified: boolean; marketingConsent: boolean | null },
  manifests: [] as Array<{ manifest: unknown }>,
  map: {} as Record<string, Record<string, unknown>>,
}))

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    member: { findUnique: vi.fn(async () => state.member) },
    module: { findMany: vi.fn(async () => state.manifests) },
  },
}))
vi.mock('@/lib/modules/live-status', () => ({ INSTALLED_MODULE_WHERE: {} }))
vi.mock('@/lib/modules/extension-points.server', () => ({
  get moduleServerExtensionPointComponents() { return state.map },
}))

import { notifyMemberEmailVerified } from '@/lib/members/email-verified'

const POINT = 'core.member-email-verified'
const installed = (...ids: string[]) => ids.map((id) => ({ manifest: { extensionPoints: [{ point: POINT, id }] } }))

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  state.member = { id: 'm1', email: 'jo@example.com', emailVerified: true, marketingConsent: null }
  state.manifests = installed('a')
  state.map = {}
})

describe('notifyMemberEmailVerified', () => {
  it('hands an installed module the verified member', async () => {
    const handler = vi.fn(async () => {})
    state.map = { [POINT]: { a: handler } }
    await notifyMemberEmailVerified('m1')
    expect(handler).toHaveBeenCalledWith({ memberId: 'm1', email: 'jo@example.com', marketingConsent: null })
  })

  it('says nothing to anyone while the address is unverified', async () => {
    const handler = vi.fn(async () => {})
    state.map = { [POINT]: { a: handler } }
    state.member = { id: 'm1', email: 'jo@example.com', emailVerified: false, marketingConsent: null }
    await notifyMemberEmailVerified('m1')
    expect(handler).not.toHaveBeenCalled()
  })

  it('skips a module that is compiled in but no longer installed', async () => {
    const handler = vi.fn(async () => {})
    state.map = { [POINT]: { a: handler } }
    state.manifests = []
    await notifyMemberEmailVerified('m1')
    expect(handler).not.toHaveBeenCalled()
  })

  it('never throws, and one failing module does not stop the next', async () => {
    const next = vi.fn(async () => {})
    state.map = { [POINT]: { a: vi.fn(async () => { throw new Error('boom') }), b: next } }
    state.manifests = installed('a', 'b')
    await expect(notifyMemberEmailVerified('m1')).resolves.toBeUndefined()
    expect(next).toHaveBeenCalledOnce()
  })
})
