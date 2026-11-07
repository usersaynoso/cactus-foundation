import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { gunzipSync } from 'node:zlib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { noteDbError, dbInfraErrorCount, isDbInfraError } from '@/lib/db/infra-errors'
import { renderPage, whyUnstorable } from './render'

const html = (extra = '') => Buffer.from(`<!doctype html><html><body>${'x'.repeat(2000)}${extra}</body></html>`)
const headers = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, s-maxage=60' }

describe('what may be kept', () => {
  const check = (over: Partial<Parameters<typeof whyUnstorable>[0]> = {}) =>
    whyUnstorable({ status: 200, headers, html: html(), dbErrorsDuringRender: 0, ...over })

  it('keeps a whole, shareable page', () => {
    expect(check()).toBeNull()
  })

  it('never keeps a page that sets a cookie', () => {
    expect(check({ headers: { ...headers, 'set-cookie': ['a=1'] } })).toMatch(/cookie/)
  })

  it('never keeps a page the proxy did not mark shareable', () => {
    expect(check({ headers: { ...headers, 'cache-control': 'private, no-store' } })).toMatch(/shareable/)
    expect(check({ headers: { 'content-type': 'text/html' } })).toMatch(/shareable/)
  })

  it('never keeps a page rendered through database trouble, which looks fine but is not', () => {
    expect(check({ dbErrorsDuringRender: 1 })).toMatch(/database/)
  })

  it('never keeps a server error or a temporary redirect', () => {
    for (const status of [500, 502, 503, 302, 307]) expect(check({ status }), String(status)).toMatch(/status/)
  })

  it('keeps settled answers, with status intact', () => {
    for (const status of [301, 308, 404, 410]) expect(check({ status, headers: { 'content-type': 'text/html' } }), String(status)).toBeNull()
  })

  it('never keeps a page cut short or with a failed part', () => {
    expect(check({ html: Buffer.from('<html><body>half a pa') })).toMatch(/cut short/)
    expect(check({ html: html('<template data-dgst="123456"></template>') })).toMatch(/failed/)
    expect(check({ html: html('<template data-dgst="NEXT_HTTP_ERROR_FALLBACK;404"></template>') })).toMatch(/failed/)
  })

  it('accepts a part that deliberately draws in the browser', () => {
    expect(check({ html: html('<template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING"></template>') })).toBeNull()
  })
})

describe('database trouble', () => {
  it('counts the failures that make a page come out wrong, and no others', () => {
    const coded = (code: string) => Object.assign(new Error('x'), { code })
    expect(isDbInfraError(coded('P1001'))).toBe(true)
    expect(isDbInfraError(coded('P2024'))).toBe(true)
    expect(isDbInfraError(coded('53300'))).toBe(true)
    expect(isDbInfraError(new Error('remaining connection slots are reserved'))).toBe(true)
    expect(isDbInfraError(coded('P2002'))).toBe(false)
    expect(isDbInfraError(coded('P2025'))).toBe(false)
    expect(isDbInfraError(new Error('relation "x" does not exist'))).toBe(false)
    const before = dbInfraErrorCount()
    noteDbError(coded('P1001'))
    noteDbError(coded('P2002'))
    expect(dbInfraErrorCount()).toBe(before + 1)
  })
})

describe('the render request itself', () => {
  type Seen = { url?: string; headers: http.IncomingHttpHeaders }
  const seen: Seen[] = []
  let server: http.Server
  let port = 0

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      seen.push({ url: req.url, headers: req.headers })
      if (req.url?.startsWith('/cookie')) res.setHeader('set-cookie', 'a=1')
      res.setHeader('content-type', 'text/html')
      res.setHeader('cache-control', 'public, max-age=0, s-maxage=60')
      res.setHeader('content-security-policy', "default-src 'self'")
      res.setHeader('link', '</a.css>; rel=preload')
      res.setHeader('x-robots-tag', 'noindex')
      res.end(html())
    })
    await new Promise<void>((resolve) => server.listen(0, 'localhost', resolve))
    port = (server.address() as AddressInfo).port
  })

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
  })

  it('asks as nobody in particular: no cookie, no client address, host preserved', async () => {
    await renderPage({ port, secret: 's3cret', host: 'shop.example.com', path: '/a', query: '?width=1' })
    const request = seen.at(-1)
    expect(request?.url).toBe('/a?width=1')
    expect(request?.headers.host).toBe('shop.example.com')
    expect(request?.headers.cookie).toBeUndefined()
    expect(request?.headers.authorization).toBeUndefined()
    expect(request?.headers['x-forwarded-for']).toBeUndefined()
    expect(request?.headers['cf-connecting-ip']).toBeUndefined()
    expect(request?.headers['x-cactus-page-store-render']).toBe('s3cret')
  })

  it('compresses the body and keeps the page\'s own headers but not its hop or policy ones', async () => {
    const page = await renderPage({ port, secret: 's', host: 'h', path: '/a', query: '' })
    expect(page.unstorable).toBeNull()
    expect(page.gzipped).toBe(true)
    expect(gunzipSync(page.body).toString()).toContain('</html>')
    const names = page.headers.map(([name]) => name)
    expect(names).toEqual(expect.arrayContaining(['content-type', 'link', 'x-robots-tag']))
    expect(names).not.toContain('cache-control')
    expect(names).not.toContain('content-security-policy')
  })

  it('flags a cookie-setting answer and never carries the cookie', async () => {
    const page = await renderPage({ port, secret: 's', host: 'h', path: '/cookie', query: '' })
    expect(page.setsCookie).toBe(true)
    expect(page.unstorable).toMatch(/cookie/)
    expect(page.headers.map(([name]) => name)).not.toContain('set-cookie')
  })
})
