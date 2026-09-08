import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { purgeCdnPaths, purgeCdnEverythingOrThrow, purgeCdnEverything, isCdnPurgeConfigured } from './cdn-purge'

// Cloudflare's own shapes, verbatim in spirit: a refusal is an HTTP 200 whose
// body says success:false, which is the whole reason this file exists.
function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const REFUSAL = {
  success: false,
  errors: [{ code: 10000, message: 'Authentication error' }],
  result: null,
}

describe('cdn purge', () => {
  beforeEach(() => {
    process.env.CLOUDFLARE_PURGE_API_TOKEN = 'test-token'
    process.env.CLOUDFLARE_ZONE_ID = 'test-zone'
    process.env.SITE_URL = 'https://example.test'
  })

  afterEach(() => {
    delete process.env.CLOUDFLARE_PURGE_API_TOKEN
    delete process.env.CLOUDFLARE_ZONE_ID
    delete process.env.SITE_URL
    vi.restoreAllMocks()
  })

  it('treats a 200 that says success:false as a failure, not a purge', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(REFUSAL))
    await expect(purgeCdnEverythingOrThrow()).rejects.toThrow(/10000 Authentication error/)
  })

  it('accepts a 200 that says success:true', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply({ success: true, errors: [], result: { id: 'test-zone' } }))
    await expect(purgeCdnEverythingOrThrow()).resolves.toBeUndefined()
  })

  it('rejects a 200 carrying something that is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>nope</html>', { status: 200 }))
    await expect(purgeCdnEverythingOrThrow()).rejects.toThrow(/not JSON/)
  })

  it('still fails loudly on a bad status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(REFUSAL, 403))
    await expect(purgeCdnEverythingOrThrow()).rejects.toThrow(/HTTP 403/)
  })

  it('refuses to purge at all when the zone or token is missing', async () => {
    delete process.env.CLOUDFLARE_ZONE_ID
    expect(isCdnPurgeConfigured()).toBe(false)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await expect(purgeCdnEverythingOrThrow()).rejects.toThrow(/zone id and purge token/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('warns rather than throwing when a path purge is refused', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(REFUSAL))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(purgeCdnPaths(['/'])).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Authentication error'))
  })

  it('swallows a refusal in the best-effort full purge', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(REFUSAL))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(purgeCdnEverything()).resolves.toBeUndefined()
  })
})
