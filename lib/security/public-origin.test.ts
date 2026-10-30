import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServer, request as httpRequest, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { NextRequest } from 'next/server'
import { publicOrigin, publicUrl } from '@/lib/security/public-origin'
import { originMismatch } from '@/lib/security/origin-check'

const KEYS = ['CACTUS_HOSTING_PROVIDER', 'VERCEL', 'SITE_URL', 'VERCEL_URL'] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k]
  for (const k of KEYS) delete process.env[k]
})
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

// What Next hands the proxy and route handlers under `next start` behind Caddy:
// the URL is built from the bind address and port, the headers are the real ones.
function behindCaddy(headers: Record<string, string>, path = '/api/x', method = 'POST'): NextRequest {
  return new NextRequest(`https://localhost:3101${path}`, { method, headers })
}

describe('publicOrigin off a server', () => {
  it('is request.url exactly as before', () => {
    expect(publicOrigin(behindCaddy({ host: 'evil.example' }))).toBe('https://localhost:3101')
    expect(publicUrl(behindCaddy({}), '/x').href).toBe('https://localhost:3101/x')
  })

  it('stays out of the way on Vercel even if the server flag is also present', () => {
    process.env.CACTUS_HOSTING_PROVIDER = 'server'
    process.env.VERCEL = '1'
    process.env.SITE_URL = 'https://site.example'
    expect(publicOrigin(behindCaddy({ host: 'site.example' }))).toBe('https://localhost:3101')
  })
})

describe('publicOrigin on the server provider', () => {
  beforeEach(() => {
    process.env.CACTUS_HOSTING_PROVIDER = 'server'
    process.env.SITE_URL = 'https://site.example'
  })

  it('reads the public address from what Caddy passes', () => {
    expect(publicOrigin(behindCaddy({ host: 'site.example', 'x-forwarded-proto': 'https' }))).toBe('https://site.example')
    expect(publicOrigin(behindCaddy({ host: 'localhost:3101', 'x-forwarded-host': 'site.example', 'x-forwarded-proto': 'https' }))).toBe(
      'https://site.example'
    )
  })

  it('takes the protocol from SITE_URL when the proxy sent none', () => {
    expect(publicOrigin(behindCaddy({ host: 'site.example' }))).toBe('https://site.example')
  })

  it('answers the www twin of an apex SITE_URL with the twin, so nobody is locked out', () => {
    expect(publicOrigin(behindCaddy({ host: 'www.site.example', 'x-forwarded-proto': 'https' }))).toBe('https://www.site.example')
    process.env.SITE_URL = 'https://www.site.example'
    expect(publicOrigin(behindCaddy({ host: 'site.example', 'x-forwarded-proto': 'https' }))).toBe('https://site.example')
  })

  it('never lets a request name an address that is not the site\'s own', () => {
    expect(publicOrigin(behindCaddy({ host: 'evil.example', 'x-forwarded-proto': 'https' }))).toBe('https://site.example')
    expect(publicOrigin(behindCaddy({ host: 'site.example.evil.example' }))).toBe('https://site.example')
    expect(publicOrigin(behindCaddy({ host: 'site.example@evil.example' }))).toBe('https://site.example')
    expect(publicOrigin(behindCaddy({ host: '127.0.0.1:3101' }))).toBe('https://site.example')
  })

  it('uses the Host as given before SITE_URL exists', () => {
    delete process.env.SITE_URL
    expect(publicOrigin(behindCaddy({ host: 'new.example', 'x-forwarded-proto': 'https' }))).toBe('https://new.example')
  })

  it('builds redirects on the public address, keeping path and query', () => {
    const r = behindCaddy({ host: 'site.example', 'x-forwarded-proto': 'https' }, '/a/b?c=1', 'GET')
    expect(publicUrl(r).href).toBe('https://site.example/a/b?c=1')
    expect(publicUrl(r, '/adm/config?tab=x').href).toBe('https://site.example/adm/config?tab=x')
  })
})

describe('originMismatch on the server provider', () => {
  beforeEach(() => {
    process.env.CACTUS_HOSTING_PROVIDER = 'server'
    process.env.SITE_URL = 'https://site.example'
  })
  const cookie = 'cactus_session=abc'

  it('accepts the browser\'s own Origin, which is what blocked every admin save', () => {
    const r = behindCaddy({ host: 'site.example', 'x-forwarded-proto': 'https', origin: 'https://site.example', cookie })
    expect(originMismatch(r)).toBe(false)
  })

  it('accepts the www twin on its own address', () => {
    const r = behindCaddy({ host: 'www.site.example', 'x-forwarded-proto': 'https', origin: 'https://www.site.example', cookie })
    expect(originMismatch(r)).toBe(false)
  })

  it('still refuses a cross-site Origin', () => {
    const r = behindCaddy({ host: 'site.example', 'x-forwarded-proto': 'https', origin: 'https://evil.example', cookie })
    expect(originMismatch(r)).toBe(true)
  })

  it('is not fooled by a forged Host that matches the attacker\'s Origin', () => {
    const r = behindCaddy({ host: 'evil.example', 'x-forwarded-proto': 'https', origin: 'https://evil.example', cookie })
    expect(originMismatch(r)).toBe(true)
  })
})

// The same logic over a real socket: a real http server stands in for `next
// start` and sees exactly the headers a proxy would pass, with a request URL
// built from its own bind address the way Next builds it.
describe('over a real http server', () => {
  let server: Server
  let port: number

  beforeEach(async () => {
    process.env.CACTUS_HOSTING_PROVIDER = 'server'
    process.env.SITE_URL = 'https://site.example'
    server = createServer((req, res) => {
      const headers = new Headers()
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
      const next = new NextRequest(`https://localhost:${port}${req.url}`, { method: req.method, headers })
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ origin: publicOrigin(next), mismatch: originMismatch(next) }))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as AddressInfo).port
  })
  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  function post(headers: Record<string, string>): Promise<{ origin: string; mismatch: boolean }> {
    return new Promise((resolve, reject) => {
      const req = httpRequest({ host: '127.0.0.1', port, method: 'POST', path: '/api/x', headers }, (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => resolve(JSON.parse(body)))
      })
      req.on('error', reject)
      req.end()
    })
  }

  it('lets the signed-in admin save and refuses the forged one', async () => {
    const good = await post({ host: 'site.example', 'x-forwarded-proto': 'https', origin: 'https://site.example', cookie: 'a=1' })
    expect(good).toEqual({ origin: 'https://site.example', mismatch: false })
    const bad = await post({ host: 'site.example', 'x-forwarded-proto': 'https', origin: 'https://evil.example', cookie: 'a=1' })
    expect(bad.mismatch).toBe(true)
    const forged = await post({ host: 'evil.example', origin: 'https://evil.example', cookie: 'a=1' })
    expect(forged).toEqual({ origin: 'https://site.example', mismatch: true })
  })
})
