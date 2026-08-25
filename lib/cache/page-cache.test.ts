import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/modules/cache-cookies', () => ({
  moduleCacheBypassCookies: ['cactus_test_module_cookie'],
}))

import {
  cdnCacheControl,
  pageCacheControl,
  normalisePageCacheTtl,
  cacheBypassCookieNames,
  DEFAULT_PAGE_CACHE_TTL,
  PAGE_CACHE_TTL_OPTIONS,
} from './page-cache'

type Overrides = Partial<Parameters<typeof pageCacheControl>[0]>

function decide(overrides: Overrides = {}) {
  return pageCacheControl({
    enabled: true,
    ttl: 300,
    method: 'GET',
    header: () => null,
    hasCookie: () => false,
    ...overrides,
  })
}

// Reads one header out of a plain object, case-insensitively, the way a real
// request does - the decision must not depend on how a header was capitalised.
function headersFrom(map: Record<string, string>) {
  const lower = Object.fromEntries(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v]))
  return (name: string) => lower[name.toLowerCase()] ?? null
}

describe('normalisePageCacheTtl', () => {
  it('accepts every offered window', () => {
    for (const ttl of PAGE_CACHE_TTL_OPTIONS) {
      expect(normalisePageCacheTtl(ttl)).toBe(ttl)
    }
  })

  it('falls back to the default for anything else', () => {
    for (const bad of [0, -1, 7, 3000000, NaN, null, undefined, 'lots', {}]) {
      expect(normalisePageCacheTtl(bad)).toBe(DEFAULT_PAGE_CACHE_TTL)
    }
  })
})

describe('cacheBypassCookieNames', () => {
  it('includes core sessions and whatever the modules declared', () => {
    const names = cacheBypassCookieNames()
    expect(names).toContain('cactus_session')
    expect(names).toContain('cactus_member_session')
    expect(names).toContain('cactus_test_module_cookie')
  })

  it('is sorted and free of duplicates', () => {
    const names = cacheBypassCookieNames()
    expect(names).toEqual([...new Set(names)].sort())
  })
})

// The header that survives on Vercel, where Next.js rewrites Cache-Control for a
// rendered page regardless of what the proxy set. Getting this wrong is not a
// visible failure - the switch reads as on and the site quietly carries on
// answering no-store, which is exactly what happened the first time.
describe('cdnCacheControl', () => {
  it('carries the chosen window', () => {
    expect(cdnCacheControl(300)).toBe('public, s-maxage=300')
    expect(cdnCacheControl(3600)).toBe('public, s-maxage=3600')
  })

  it('falls back to the default window rather than trusting a junk value', () => {
    expect(cdnCacheControl(999999)).toBe(`public, s-maxage=${DEFAULT_PAGE_CACHE_TTL}`)
  })

  // Cloudflare answers BYPASS rather than caching when it meets a directive it
  // will not honour in this header, so a well-meant extra silently switches the
  // whole feature off. Keep it to public + s-maxage.
  it('carries no directive beyond public and s-maxage', () => {
    const directives = cdnCacheControl(300).split(',').map((d) => d.trim().split('=')[0])
    expect(directives.sort()).toEqual(['public', 's-maxage'])
  })
})

describe('pageCacheControl', () => {
  it('is silent when the switch is off', () => {
    expect(decide({ enabled: false })).toBeNull()
  })

  it('makes a plain public GET shareable', () => {
    expect(decide()).toBe('public, max-age=0, s-maxage=300, stale-while-revalidate=300')
  })

  it('honours the chosen window', () => {
    expect(decide({ ttl: 3600 })).toBe('public, max-age=0, s-maxage=3600, stale-while-revalidate=3600')
  })

  it('falls back to the default window rather than trusting a junk value', () => {
    expect(decide({ ttl: 999999 })).toContain(`s-maxage=${DEFAULT_PAGE_CACHE_TTL}`)
  })

  it('keeps the visitor’s own browser out of it', () => {
    // max-age=0 is what stops a shopper sitting on yesterday's price after being
    // told it changed; s-maxage is the half a CDN reads.
    expect(decide()).toContain('max-age=0')
  })

  it('caches HEAD as well as GET', () => {
    expect(decide({ method: 'HEAD' })).not.toBeNull()
    expect(decide({ method: 'get' })).not.toBeNull()
  })

  it('never caches a request that is doing something', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(decide({ method })).toBeNull()
    }
  })

  // Cloudflare honours Vary for Accept-Encoding and nothing else, so a shared
  // cache allowed to hold both the document and the RSC payload for one URL will
  // eventually hand over the wrong one. Only the document is ever cacheable.
  it.each(['rsc', 'next-router-prefetch', 'next-router-state-tree'])(
    'never caches a %s request',
    (header) => {
      expect(decide({ header: headersFrom({ [header]: '1' }) })).toBeNull()
    }
  )

  it('is not fooled by header capitalisation', () => {
    expect(decide({ header: headersFrom({ RSC: '1' }) })).toBeNull()
  })

  it('leaves range requests alone', () => {
    expect(decide({ header: headersFrom({ range: 'bytes=0-99' }) })).toBeNull()
  })

  it.each(['cactus_session', 'cactus_member_session', 'cactus_test_module_cookie'])(
    'never shares a response for a request carrying %s',
    (cookie) => {
      expect(decide({ hasCookie: (name) => name === cookie })).toBeNull()
    }
  )

  it('ignores a cookie nobody declared', () => {
    expect(decide({ hasCookie: (name) => name === 'some_analytics_cookie' })).not.toBeNull()
  })

  // The whole design rests on this: the decision either makes a response
  // shareable or says nothing at all. It must never emit a no-store of its own,
  // because proxy.ts cannot tell a per-visitor page from a prerendered one and a
  // blanket no-store would switch off caching a static page already had.
  it('never emits a no-store of its own', () => {
    const cases: Overrides[] = [
      { enabled: false },
      { method: 'POST' },
      { header: headersFrom({ rsc: '1' }) },
      { hasCookie: () => true },
    ]
    for (const c of cases) {
      const result = decide(c)
      expect(result).toBeNull()
    }
  })
})
