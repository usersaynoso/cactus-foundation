import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/setup/setup-gate', () => ({ setupClosedResponse: async () => null }))
vi.mock('@/lib/config/env', () => ({ isLocalMode: () => false }))
vi.mock('@/lib/hosting/deploy', () => ({
  triggerRedeploy: vi.fn(),
  ensureRedeploy: vi.fn(),
  getHostSiteName: vi.fn(),
}))
vi.mock('@/lib/hosting/env', () => ({ getHostEnvVarKeys: vi.fn(), upsertHostEnvVars: vi.fn() }))
vi.mock('@/lib/hosting/provider', () => ({
  missingCredentialsMessage: () => 'no host',
  resolveHostingCredentials: () => ({ provider: 'vercel', token: 't', siteId: 's' }),
}))

import { POST } from './route'

function req(body: unknown) {
  return new NextRequest('http://localhost/api/setup/provision-db', { method: 'POST', body: JSON.stringify(body) })
}

const fetchSpy = vi.fn()
beforeEach(() => {
  fetchSpy.mockReset()
  vi.stubGlobal('fetch', fetchSpy)
  process.env.NEON_API_KEY = 'env-key'
  delete process.env.DATABASE_URL
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.NEON_API_KEY
})

describe('provision-db never uses the environment Neon key on existing projects', () => {
  it.each(['list', 'check-existing', 'use-existing'])('%s refuses without a body key', async (action) => {
    const res = await POST(req({ action, projectId: 'p1', destroyData: true }))
    expect(res.status).toBe(400)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('list works with a key supplied in the body, using that key', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ organizations: [] }), { status: 200 }))
    await POST(req({ action: 'list', neonApiKey: 'body-key' }))
    const auth = (fetchSpy.mock.calls[0]?.[1] as { headers: { Authorization: string } }).headers.Authorization
    expect(auth).toBe('Bearer body-key')
  })
})
