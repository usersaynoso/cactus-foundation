import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import sharp from 'sharp'
import type { ResolvedBranding, IconMedia } from '@/lib/config/branding'

// The icon route with the database and storage faked: the decisions that have
// gone wrong on a live site, checked end to end through the real handler.

const state: { branding: ResolvedBranding; files: Map<string, Buffer>; failReads: boolean } = {
  branding: undefined as unknown as ResolvedBranding,
  files: new Map(),
  failReads: false,
}

vi.mock('@/lib/config/branding', () => ({ resolveBranding: async () => state.branding }))
vi.mock('@/lib/media/upload', () => ({
  downloadMedia: async (_provider: string, key: string) => {
    if (state.failReads) throw new Error('storage down')
    const f = state.files.get(key)
    if (!f) throw new Error('missing')
    return f
  },
}))

const cactus96 = readFileSync(join(process.cwd(), 'public/cactus-favicon-96x96.png'))
const cactusSvg = readFileSync(join(process.cwd(), 'public/cactus-favicon.svg'))

const EMPTY = { favicon: null, faviconDark: null, appIcon: null, icon16: null, icon32: null, appleTouch: null, icon192: null, icon512: null }

function branding(over: Partial<ResolvedBranding>): ResolvedBranding {
  return {
    state: 'live', icons: EMPTY, iconVersion: null,
    faviconUrl: null, faviconDarkUrl: null, faviconMimeType: null, faviconDarkMimeType: null,
    icon16Url: null, icon32Url: null, appleTouchUrl: null, icon192Url: null, icon512Url: null,
    name: 'Site', shortName: 'Site', themeColor: '#fff', backgroundColor: '#ffffff',
    ...over,
  }
}

function media(id: string, mimeType: string): IconMedia {
  return { id, url: `https://media.example/${id}`, key: id, mimeType, provider: 'B2' }
}

async function get(path: string, segment?: string) {
  const { GET } = await import('./route')
  const res = await GET(new Request(`https://site.example${path}`), { params: Promise.resolve({ variant: segment ? [segment] : undefined }) })
  const body = Buffer.from(await res.arrayBuffer())
  return { res, body }
}

beforeEach(async () => {
  vi.resetModules()
  state.files = new Map()
  state.failReads = false
})

describe('icon route', () => {
  it('draws every sized PNG from a WebP favicon at exactly its size', async () => {
    state.files.set('fav', await sharp(cactus96).webp().toBuffer())
    state.branding = branding({ icons: { ...EMPTY, favicon: media('fav', 'image/webp') }, iconVersion: 'v1' })
    for (const [segment, size] of [['icon-16', 16], ['icon-32', 32], ['icon-96', 96], ['apple-touch', 180], ['icon-192', 192], ['icon-512', 512]] as const) {
      const { res, body } = await get(`/api/branding/favicon/${segment}`, segment)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('image/png')
      const meta = await sharp(body).metadata()
      expect(meta.format).toBe('png')
      expect([meta.width, meta.height]).toEqual([size, size])
    }
  })

  it('answers /favicon.ico with a real ICO', async () => {
    state.files.set('fav', await sharp(cactus96).webp().toBuffer())
    state.branding = branding({ icons: { ...EMPTY, favicon: media('fav', 'image/webp') } })
    const { res, body } = await get('/api/branding/favicon/favicon', 'favicon')
    expect(res.headers.get('content-type')).toBe('image/x-icon')
    expect([...body.subarray(0, 4)]).toEqual([0, 0, 1, 0])
    expect(body.readUInt16LE(4)).toBe(3)
  })

  it('serves an uploaded SVG as an inert SVG', async () => {
    state.files.set('svg', cactusSvg)
    state.branding = branding({ icons: { ...EMPTY, favicon: media('svg', 'image/svg+xml') } })
    const { res } = await get('/api/branding/favicon/svg', 'svg')
    expect(res.headers.get('content-type')).toBe('image/svg+xml')
    expect(res.headers.get('content-security-policy')).toContain('sandbox')
  })

  it('never redirects to Cactus when the branding read failed', async () => {
    state.branding = branding({ state: 'unavailable' })
    const { res } = await get('/api/branding/favicon/favicon', 'favicon')
    expect(res.status).toBe(503)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('location')).toBeNull()
  })

  it('answers a failed read from memory once it has drawn the icon', async () => {
    state.files.set('fav', cactus96)
    state.branding = branding({ icons: { ...EMPTY, favicon: media('fav', 'image/png') } })
    const { GET } = await import('./route')
    const ctx = { params: Promise.resolve({ variant: ['icon-32'] }) }
    const first = await GET(new Request('https://site.example/api/branding/favicon/icon-32'), ctx)
    expect(first.status).toBe(200)
    state.branding = branding({ state: 'unavailable' })
    const again = await GET(new Request('https://site.example/api/branding/favicon/icon-32'), { params: Promise.resolve({ variant: ['icon-32'] }) })
    expect(again.status).toBe(200)
    expect(again.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=60')
  })

  it('never redirects to Cactus when storage cannot be read on a branded site', async () => {
    state.failReads = true
    state.branding = branding({ icons: { ...EMPTY, favicon: media('fav', 'image/png') } })
    const { res } = await get('/api/branding/favicon/favicon', 'favicon')
    expect(res.status).toBe(503)
    expect(res.headers.get('location')).toBeNull()
  })

  it('falls through a broken slot to the next icon that works', async () => {
    state.files.set('app', cactus96)
    state.branding = branding({ icons: { ...EMPTY, icon16: media('gone', 'image/png'), appIcon: media('app', 'image/png') } })
    const { res, body } = await get('/api/branding/favicon/icon-16', 'icon-16')
    expect(res.status).toBe(200)
    expect((await sharp(body).metadata()).width).toBe(16)
  })

  it('sends a site with no icons at all to the bundled Cactus file', async () => {
    state.branding = branding({})
    const { res } = await get('/api/branding/favicon/icon-16', 'icon-16')
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://site.example/cactus-favicon-16x16.png')
  })

  it('marks a matching ?v= as immutable and an unversioned request as an hour', async () => {
    state.files.set('fav', cactus96)
    state.branding = branding({ icons: { ...EMPTY, favicon: media('fav', 'image/png') }, iconVersion: 'abc' })
    expect((await get('/api/branding/favicon/icon-32?v=abc', 'icon-32')).res.headers.get('cache-control')).toContain('immutable')
    expect((await get('/api/branding/favicon/icon-32', 'icon-32')).res.headers.get('cache-control')).toContain('max-age=3600')
  })

  it('answers a conditional request with 304', async () => {
    state.files.set('fav', cactus96)
    state.branding = branding({ icons: { ...EMPTY, favicon: media('fav', 'image/png') } })
    const { GET } = await import('./route')
    const first = await GET(new Request('https://site.example/api/branding/favicon/icon-32'), { params: Promise.resolve({ variant: ['icon-32'] }) })
    const etag = first.headers.get('etag')!
    const second = await GET(new Request('https://site.example/api/branding/favicon/icon-32', { headers: { 'if-none-match': etag } }), { params: Promise.resolve({ variant: ['icon-32'] }) })
    expect(second.status).toBe(304)
  })
})
