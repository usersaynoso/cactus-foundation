import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// What the proxy actually puts on a response for each CACTUS_HSTS setting. The
// security headers are built once when proxy.ts loads, so every case sets the
// variable and then imports a fresh copy. The parsing rules themselves are
// covered in lib/security/hsts.test.ts.
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }))

vi.mock('@/lib/config/site', () => ({
  isFirstRunComplete: async () => false,
  refreshFirstRunComplete: async () => false,
  getAdminPathCached: async () => null,
  getSiteStatusCached: async () => 'live',
  getPageCacheCached: async () => ({ enabled: false, ttl: 60, behindCloudflare: false }),
}))

vi.mock('@/lib/config/edge-config', () => ({
  getAdminPathFromEdgeConfig: async () => null,
  getSiteStatusFromEdgeConfig: async () => null,
}))

vi.mock('@/lib/members/config', () => ({ getMembersConfigCached: async () => ({ enabled: false }) }))

async function hstsFor(value: string | undefined): Promise<string | null> {
  if (value === undefined) delete process.env.CACTUS_HSTS
  else process.env.CACTUS_HSTS = value
  vi.resetModules()
  const { proxy } = await import('./proxy')
  // /setup is answered by the proxy with security headers and needs no database.
  const res = await proxy(new NextRequest(new URL('/setup', 'https://example.com')))
  return res.headers.get('Strict-Transport-Security')
}

describe('proxy Strict-Transport-Security header', () => {
  const original = process.env.CACTUS_HSTS
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warn.mockRestore()
    if (original === undefined) delete process.env.CACTUS_HSTS
    else process.env.CACTUS_HSTS = original
  })

  it('sends the long-standing default when CACTUS_HSTS is unset', async () => {
    expect(await hstsFor(undefined)).toBe('max-age=63072000; includeSubDomains; preload')
    expect(warn).not.toHaveBeenCalled()
  })

  it('sends the override when CACTUS_HSTS is a valid value', async () => {
    expect(await hstsFor('max-age=31536000')).toBe('max-age=31536000')
    expect(warn).not.toHaveBeenCalled()
  })

  it('sends no HSTS header when CACTUS_HSTS is off', async () => {
    expect(await hstsFor('off')).toBeNull()
  })

  it('falls back to the default and warns once when CACTUS_HSTS is malformed', async () => {
    expect(await hstsFor('max-age=soon')).toBe('max-age=63072000; includeSubDomains; preload')
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
