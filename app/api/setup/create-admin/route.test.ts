import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma } = vi.hoisted(() => ({
  prisma: {
    siteConfig: { findUnique: vi.fn() },
    user: { count: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    passkey: { deleteMany: vi.fn() },
    role: { findFirst: vi.fn(), create: vi.fn() },
  },
}))
vi.mock('@/lib/db/prisma', () => ({ prisma }))
vi.mock('@/lib/config/site', () => ({ isBlocklisted: () => false }))
vi.mock('@/lib/config/env', () => ({ requiredEnvMissing: () => [] }))
vi.mock('@/lib/permissions/check', () => ({ seedCorePermissions: vi.fn() }))

const { readBootstrapUserId, setBootstrapCookie } = vi.hoisted(() => ({ readBootstrapUserId: vi.fn(), setBootstrapCookie: vi.fn() }))
vi.mock('@/lib/setup/bootstrap-cookie', () => ({
  readBootstrapUserId,
  setBootstrapCookie,
  SETUP_LOCKED_OUT_MESSAGE: 'locked out',
}))

import { POST } from './route'

function req(body: unknown) {
  return new NextRequest('http://localhost/api/setup/create-admin', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
const body = { username: 'owner', email: 'owner@example.com' }

beforeEach(() => {
  vi.clearAllMocks()
  prisma.siteConfig.findUnique.mockResolvedValue({ setupCompleted: false })
  prisma.user.count.mockResolvedValue(1)
  prisma.role.findFirst.mockResolvedValue({ id: 'role-admin' })
  readBootstrapUserId.mockResolvedValue(null)
})

describe('POST /api/setup/create-admin', () => {
  it('creates the first admin and sets the bootstrap cookie', async () => {
    prisma.user.count.mockResolvedValue(0)
    prisma.user.findFirst.mockResolvedValue(null)
    prisma.user.create.mockResolvedValue({ id: 'u1' })
    const res = await POST(req(body))
    expect(res.status).toBe(200)
    expect(setBootstrapCookie).toHaveBeenCalledWith('u1')
  })

  it('refuses an exact-match retry without the cookie, and wipes nothing', async () => {
    prisma.user.findFirst.mockResolvedValueOnce({ id: 'u1' })
    const res = await POST(req(body))
    expect(res.status).toBe(403)
    expect(prisma.passkey.deleteMany).not.toHaveBeenCalled()
    expect(setBootstrapCookie).not.toHaveBeenCalled()
  })

  it('allows the exact-match retry with the right cookie', async () => {
    readBootstrapUserId.mockResolvedValue('u1')
    prisma.user.findFirst.mockResolvedValueOnce({ id: 'u1' })
    const res = await POST(req(body))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ userId: 'u1' })
    expect(prisma.passkey.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } })
  })

  it('will not mint a second admin for a caller without the cookie', async () => {
    prisma.user.findFirst
      .mockResolvedValueOnce(null) // no exact match
      .mockResolvedValueOnce({ id: 'u1' }) // an admin exists
    const res = await POST(req({ username: 'other', email: 'other@example.com' }))
    expect(res.status).toBe(403)
    expect(prisma.user.create).not.toHaveBeenCalled()
  })

  it('lets the cookie holder change the unfinished admin in place', async () => {
    readBootstrapUserId.mockResolvedValue('u1')
    prisma.user.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'u1' })
      .mockResolvedValueOnce(null) // no clash
    const res = await POST(req({ username: 'other', email: 'other@example.com' }))
    expect(res.status).toBe(200)
    expect(prisma.user.update).toHaveBeenCalled()
    expect(prisma.user.create).not.toHaveBeenCalled()
  })
})
