import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/modules/cache-cookies', () => ({
  moduleCacheBypassCookies: ['cactus_test_module_cookie'],
}))

const pageCache = vi.hoisted(() => ({
  value: { enabled: true, ttl: 300, longTtl: 0, vercelEdgeTtl: 60, behindCloudflare: false },
}))

vi.mock('@/lib/config/site', () => ({
  getPageCacheCached: async () => pageCache.value,
}))

import { applyModuleApiCache } from './module-api-cache'

function request(init: { method?: string; cookie?: string } = {}) {
  return new Request('https://example.test/api/m/shop/public/things', {
    method: init.method ?? 'GET',
    headers: init.cookie ? { cookie: init.cookie } : undefined,
  })
}

function ok(body = '{}', headers: Record<string, string> = {}) {
  return new Response(body, { status: 200, headers })
}

beforeEach(() => {
  pageCache.value = { enabled: true, ttl: 300, longTtl: 0, vercelEdgeTtl: 60, behindCloudflare: false }
})

describe('applyModuleApiCache', () => {
  it('leaves a route that declared nothing exactly as it was', async () => {
    const res = await applyModuleApiCache(request(), ok(), {})
    expect(res.headers.get('Cache-Control')).toBeNull()
    expect(res.headers.get('CDN-Cache-Control')).toBeNull()
  })

  it('adds a shared-cache window for a route that declared one', async () => {
    const res = await applyModuleApiCache(request(), ok(), { publicCacheTtl: 300 })
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=300, stale-while-revalidate=300')
    expect(res.headers.get('CDN-Cache-Control')).toBe('public, max-age=300, stale-while-revalidate=300')
  })

  it('keeps the body and status intact', async () => {
    const res = await applyModuleApiCache(request(), ok('{"products":[]}'), { publicCacheTtl: 60 })
    expect(res.status).toBe(200)
    await expect(res.text()).resolves.toBe('{"products":[]}')
  })

  it('says nothing when the owner has ready-made copies switched off', async () => {
    pageCache.value = { ...pageCache.value, enabled: false }
    const res = await applyModuleApiCache(request(), ok(), { publicCacheTtl: 300 })
    expect(res.headers.get('CDN-Cache-Control')).toBeNull()
  })

  it('never caches anything but a successful read', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const res = await applyModuleApiCache(request({ method }), ok(), { publicCacheTtl: 300 })
      expect(res.headers.get('CDN-Cache-Control'), method).toBeNull()
    }
    for (const status of [204, 302, 400, 404, 500]) {
      const res = await applyModuleApiCache(request(), new Response(null, { status }), { publicCacheTtl: 300 })
      expect(res.headers.get('CDN-Cache-Control'), String(status)).toBeNull()
    }
  })

  it('leaves a route that set its own Cache-Control alone', async () => {
    const res = await applyModuleApiCache(request(), ok('{}', { 'Cache-Control': 'public, s-maxage=15' }), {
      publicCacheTtl: 300,
    })
    expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=15')
    expect(res.headers.get('CDN-Cache-Control')).toBeNull()
  })

  it('never caches a request carrying a session, member or module bypass cookie', async () => {
    for (const cookie of ['cactus_session=x', 'cactus_member_session=x', 'cactus_test_module_cookie=x']) {
      const res = await applyModuleApiCache(request({ cookie: `a=1; ${cookie}; b=2` }), ok(), { publicCacheTtl: 300 })
      expect(res.headers.get('CDN-Cache-Control'), cookie).toBeNull()
    }
  })

  it('caches for a request carrying only ordinary cookies', async () => {
    const res = await applyModuleApiCache(request({ cookie: 'cactus_theme=dark; _ga=1' }), ok(), { publicCacheTtl: 300 })
    expect(res.headers.get('CDN-Cache-Control')).toBe('public, max-age=300, stale-while-revalidate=300')
  })

  it('moves the copy downstream when something there can be purged', async () => {
    pageCache.value = { ...pageCache.value, behindCloudflare: true }
    const res = await applyModuleApiCache(request(), ok(), { publicCacheTtl: 300 })
    expect(res.headers.get('Vercel-CDN-Cache-Control')).toBe('public, s-maxage=60')
  })

  it('never lets the upstream copy outlive the downstream one', async () => {
    pageCache.value = { ...pageCache.value, behindCloudflare: true, vercelEdgeTtl: 900 }
    const res = await applyModuleApiCache(request(), ok(), { publicCacheTtl: 60 })
    expect(res.headers.get('Vercel-CDN-Cache-Control')).toBe('public, s-maxage=60')
  })

  it('keeps nothing upstream when the owner asked for instant purges', async () => {
    pageCache.value = { ...pageCache.value, behindCloudflare: true, vercelEdgeTtl: 0 }
    const res = await applyModuleApiCache(request(), ok(), { publicCacheTtl: 300 })
    expect(res.headers.get('Vercel-CDN-Cache-Control')).toBe('public, s-maxage=0, must-revalidate')
  })

  it('ignores a declaration that is not a positive number, and caps a silly one', async () => {
    for (const bad of [0, -5, NaN, '300', null, undefined, {}]) {
      const res = await applyModuleApiCache(request(), ok(), { publicCacheTtl: bad })
      expect(res.headers.get('CDN-Cache-Control'), String(bad)).toBeNull()
    }
    const capped = await applyModuleApiCache(request(), ok(), { publicCacheTtl: 999999 })
    expect(capped.headers.get('CDN-Cache-Control')).toBe('public, max-age=3600, stale-while-revalidate=3600')
  })
})
