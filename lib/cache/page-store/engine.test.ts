import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// A stand-in for the real server: renders "a page" whose price comes from a variable,
// counts renders, and shows whether it could see anything personal. Everything between
// the proxy's question and that server is the real code.
const queryRaw = vi.fn<() => Promise<unknown[]>>(async () => [])
vi.mock('@/lib/db/prisma', () => ({ prisma: { $queryRawUnsafe: () => queryRaw() } }))
vi.mock('@/lib/modules/cache-cookies', () => ({ moduleCacheBypassCookies: [], moduleAddressBases: ['shop'] }))

const { answerFromPageStore, isOwnRender } = await import('./engine')
const { clearPageStore, invalidatePageStore, pageStoreStats } = await import('./signal')

let price = 100
let renders = 0
let renderDelayMs = 5
let lastCookie: string | undefined
let server: http.Server

beforeAll(async () => {
  server = http.createServer((req, res) => {
    renders += 1
    lastCookie = req.headers.cookie
    setTimeout(() => {
      if (req.url?.startsWith('/gone')) res.statusCode = 404
      if (req.url?.startsWith('/broken')) res.statusCode = 500
      if (req.url?.startsWith('/cookie')) res.setHeader('set-cookie', 'mine=1')
      res.setHeader('content-type', 'text/html')
      res.setHeader('cache-control', 'public, max-age=0, s-maxage=60')
      res.end(`<html><body>price:${price} url:${req.url} cookie:${req.headers.cookie ?? 'none'}${' '.repeat(2000)}</body></html>`)
    }, renderDelayMs)
  })
  await new Promise<void>((resolve) => server.listen(0, 'localhost', resolve))
  process.env.PORT = String((server.address() as AddressInfo).port)
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
})

beforeEach(() => {
  clearPageStore()
  price = 100
  renders = 0
  renderDelayMs = 5
})

afterEach(() => {
  vi.useRealTimers()
})

const settings = { paths: '/shop/categories/*', ignoreTables: '' }

function ask(path: string, search = '') {
  return answerFromPageStore({ method: 'GET', host: 'example.com', path, search }, settings)
}

function text(answer: Awaited<ReturnType<typeof ask>>): string {
  return answer?.body?.toString() ?? ''
}

describe('serving', () => {
  it('renders once, then answers without rendering', async () => {
    expect((await ask('/a'))?.state).toBe('MISS')
    const second = await ask('/a')
    expect(second?.state).toBe('HIT')
    expect(text(second)).toContain('price:100')
    expect(renders).toBe(1)
  })

  it('leaves addresses it may not hold to the normal route', async () => {
    expect(await ask('/shop/cart')).toBeNull()
    expect(await ask('/shop/collections/x')).toBeNull()
    expect(await ask('/a', '?key=secret')).toBeNull()
    expect(renders).toBe(0)
  })

  it('collapses simultaneous requests for one address into one render', async () => {
    renderDelayMs = 40
    const answers = await Promise.all(Array.from({ length: 50 }, () => ask('/popular')))
    expect(renders).toBe(1)
    expect(answers.filter((a) => a?.status === 200)).toHaveLength(50)
    expect(answers.filter((a) => a?.state === 'MISS')).toHaveLength(1)
    expect(answers.filter((a) => a?.state === 'JOINED')).toHaveLength(49)
  })

  it('never runs more than a handful of renders at once, however many addresses arrive', async () => {
    renderDelayMs = 30
    let peak = 0
    const sampler = setInterval(() => {
      peak = Math.max(peak, pageStoreStats()?.rendering ?? 0)
    }, 2)
    await Promise.all(Array.from({ length: 40 }, (_, i) => ask(`/page-${i}`)))
    clearInterval(sampler)
    expect(renders).toBe(40)
    expect(peak).toBeLessThanOrEqual(4)
    expect(peak).toBeGreaterThan(1)
  })

  it('shares one entry across tracking tags and keeps page-changing parameters apart', async () => {
    await ask('/a', '?srsltid=one')
    await ask('/a', '?utm_source=two')
    await ask('/a')
    expect(renders).toBe(1)
    const wide = await ask('/a', '?width=180')
    expect(text(wide)).toContain('url:/a?width=180')
    expect(renders).toBe(2)
    expect(text(await ask('/a', '?width=200'))).toContain('url:/a?width=200')
    expect(renders).toBe(3)
  })

  it('renders with tracking tags stripped, so they cannot end up in the held page', async () => {
    expect(text(await ask('/a', '?utm_source=leak&width=1'))).not.toContain('leak')
  })

  it('always hands back plain HTML, because Next compresses whatever it is given', async () => {
    await ask('/a')
    const held = await ask('/a')
    expect(held?.state).toBe('HIT')
    expect(held?.body?.subarray(0, 2).toString('hex')).not.toBe('1f8b')
    expect(held?.body?.toString()).toContain('</html>')
  })

  it('answers HEAD with no body', async () => {
    await ask('/a')
    const head = await answerFromPageStore({ method: 'HEAD', host: 'example.com', path: '/a', search: '' }, settings)
    expect(head?.status).toBe(200)
    expect(head?.body).toBeNull()
  })

  it('keeps status codes as they came: a held 404 is still a 404', async () => {
    expect((await ask('/gone'))?.status).toBe(404)
    const again = await ask('/gone')
    expect(again?.status).toBe(404)
    expect(again?.state).toBe('HIT')
    expect(renders).toBe(1)
  })

  it('passes a server error on to whoever asked but never keeps it', async () => {
    expect((await ask('/broken'))?.status).toBe(500)
    expect((await ask('/broken'))?.status).toBe(500)
    expect(renders).toBe(2)
  })

  it('never hands a cookie-setting answer to anyone, and leaves it to the normal route', async () => {
    expect(await ask('/cookie')).toBeNull()
    expect(await ask('/cookie')).toBeNull()
    expect(renders).toBe(2)
  })

  it('recognises only its own render requests', async () => {
    await ask('/a')
    expect(isOwnRender('guess')).toBe(false)
    expect(isOwnRender(null)).toBe(false)
    expect(isOwnRender('')).toBe(false)
  })
})

describe('personal content', () => {
  it('a render never carries a visitor\'s cookies, so nothing personal can be held', async () => {
    expect(text(await ask('/a'))).toContain('cookie:none')
    expect(lastCookie).toBeUndefined()
  })
})

describe('when a product changes', () => {
  it('a quiet site shows the new price to the very next visitor', async () => {
    expect(text(await ask('/category'))).toContain('price:100')
    price = 80
    invalidatePageStore('shp_products')
    const next = await ask('/category')
    expect(next?.state).toBe('MISS')
    expect(text(next)).toContain('price:80')
  })

  it('every held page goes out of date, the listings as much as the product', async () => {
    await ask('/product')
    await ask('/shop/categories/chairs')
    await ask('/black-mesh-office-chairs')
    price = 80
    invalidatePageStore('shp_products')
    for (const path of ['/product', '/shop/categories/chairs', '/black-mesh-office-chairs']) {
      expect(text(await ask(path)), path).toContain('price:80')
    }
  })

  it('a busy site gets the old copy at once and a refresh behind it', async () => {
    await ask('/held')
    price = 80
    invalidatePageStore('shp_products')
    renderDelayMs = 60
    // Fill the gate, so the site is busy.
    const crowd = Array.from({ length: 12 }, (_, i) => ask(`/crowd-${i}`))
    await new Promise((resolve) => setTimeout(resolve, 5))
    const during = await ask('/held')
    expect(during?.state).toBe('STALE')
    expect(text(during)).toContain('price:100')
    await Promise.all(crowd)
    const after = await ask('/held')
    expect(text(after)).toContain('price:80')
  })

  it('a render under way when the write lands cannot be trusted afterwards', async () => {
    renderDelayMs = 50
    const first = ask('/racing')
    await new Promise((resolve) => setTimeout(resolve, 10))
    invalidatePageStore('shp_products')
    await first
    price = 80
    const next = await ask('/racing')
    expect(next?.state).toBe('MISS')
    expect(text(next)).toContain('price:80')
  })

  it('the owner\'s purge button throws everything away', async () => {
    await ask('/a')
    clearPageStore()
    expect((await ask('/a'))?.state).toBe('MISS')
    expect(renders).toBe(2)
  })
})
