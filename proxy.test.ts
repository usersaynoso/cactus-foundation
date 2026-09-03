import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// The first-run gate is the only thing under test here, and it answers before
// the admin/member/status gates get a look in. Everything downstream of it is
// stubbed so the suite never needs a database.
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }))

const isFirstRunComplete = vi.fn()
const refreshFirstRunComplete = vi.fn()

vi.mock('@/lib/config/site', () => ({
  isFirstRunComplete: () => isFirstRunComplete(),
  refreshFirstRunComplete: () => refreshFirstRunComplete(),
  getAdminPathCached: async () => null,
  getSiteStatusCached: async () => 'live',
  getPageCacheCached: async () => ({ enabled: false, ttl: 60 }),
}))

vi.mock('@/lib/config/edge-config', () => ({
  getAdminPathFromEdgeConfig: async () => null,
  getSiteStatusFromEdgeConfig: async () => null,
}))

vi.mock('@/lib/members/config', () => ({ getMembersConfigCached: async () => ({ enabled: false }) }))

const { proxy } = await import('./proxy')

function request(path: string): NextRequest {
  return new NextRequest(new URL(path, 'https://example.com'))
}

function connectionRefused(): Error {
  const err = new Error("Can't reach database server at `db.example.com:6432`") as Error & { code: string }
  err.code = 'P1001'
  return err
}

function schemaMissing(): Error {
  const err = new Error('The table `public.SiteConfig` does not exist in the current database.') as Error & { code: string }
  err.code = 'P2021'
  return err
}

describe('proxy first-run gate', () => {
  const originalDbUrl = process.env.DATABASE_URL

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DATABASE_URL = 'postgresql://user:pw@db.example.com:6432/site'
  })

  afterEach(() => {
    if (originalDbUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = originalDbUrl
  })

  it('answers 503 rather than the setup wizard when the database is unreachable', async () => {
    isFirstRunComplete.mockRejectedValue(connectionRefused())
    const res = await proxy(request('/'))
    expect(res.status).toBe(503)
    expect(res.headers.get('location')).toBeNull()
    expect(res.headers.get('Retry-After')).toBe('30')
  })

  it('answers 503 as JSON on an API path', async () => {
    isFirstRunComplete.mockRejectedValue(connectionRefused())
    const res = await proxy(request('/api/admin/config'))
    expect(res.status).toBe(503)
    expect(res.headers.get('Content-Type')).toContain('application/json')
  })

  it('leaves the wizard reachable while the database is unreachable', async () => {
    refreshFirstRunComplete.mockRejectedValue(connectionRefused())
    const res = await proxy(request('/setup'))
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
  })

  it('still sends a fresh install to the wizard when no database is configured', async () => {
    delete process.env.DATABASE_URL
    isFirstRunComplete.mockRejectedValue(new Error('no connection string'))
    const res = await proxy(request('/'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://example.com/setup')
  })

  it('still sends a fresh install to the wizard when the schema is not deployed yet', async () => {
    isFirstRunComplete.mockRejectedValue(schemaMissing())
    const res = await proxy(request('/'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://example.com/setup')
  })

  it('redirects to the wizard when the read succeeds and says the site is not set up', async () => {
    isFirstRunComplete.mockResolvedValue(false)
    const res = await proxy(request('/'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://example.com/setup')
  })
})
