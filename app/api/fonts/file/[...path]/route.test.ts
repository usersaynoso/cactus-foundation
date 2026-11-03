import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { GET } from './route'

// The font file route against a faked Google: the failures that only happen now
// and then, which are the ones that left a page in system fonts.

const WOFF2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 1, 2, 3, 4])

function call(path: string) {
  const segments = path.split('?')[0]!.split('/')
  return GET(new NextRequest(`https://site.example/api/fonts/file/${path}`), { params: Promise.resolve({ path: segments }) })
}

// A fresh, never-cached address per test, so the disk cache cannot carry one
// test's answer into the next.
const fresh = () => `s/inter/v20/${randomUUID()}.woff2`

afterEach(() => vi.unstubAllGlobals())

describe('font file route', () => {
  it('serves a real font with a year of immutable cache', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(WOFF2, { status: 200 })))
    const res = await call(fresh())
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('font/woff2')
    expect(res.headers.get('cache-control')).toContain('immutable')
  })

  it('refuses a 200 whose body is not a font, and never lets it be cached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>rate limited</html>', { status: 200 })))
    const res = await call(fresh())
    expect(res.status).toBe(502)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('retries a 429 once before giving up', async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(new Response('slow down', { status: 429 }))
      .mockResolvedValueOnce(new Response(WOFF2, { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)
    const res = await call(fresh())
    expect(res.status).toBe(200)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('serves its held copy when Google is unreachable', async () => {
    const path = fresh()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(WOFF2, { status: 200 })))
    expect((await call(path)).status).toBe(200)
    const down = vi.fn(async () => { throw new Error('network down') })
    vi.stubGlobal('fetch', down)
    const res = await call(path)
    expect(res.status).toBe(200)
    expect(down).not.toHaveBeenCalled()
  })

  it('answers an unreachable Google with an uncacheable 502, not a cacheable 404', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    const res = await call(fresh())
    expect(res.status).toBe(502)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('shares one upstream request between concurrent first requests', async () => {
    const path = fresh()
    const fetchSpy = vi.fn(async () => new Response(WOFF2, { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)
    const all = await Promise.all([call(path), call(path), call(path)])
    expect(all.every((r) => r.status === 200)).toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('still refuses paths that climb out of the font tree', async () => {
    expect((await call('s/../../etc/passwd.woff2')).status).toBe(400)
  })
})
