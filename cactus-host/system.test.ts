import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { parsePasswd, realSystem } from './system.ts'

describe('realSystem.local', () => {
  // The whole reason it exists: fetch() replaces Host with the address it dialled, so
  // a health check or cron tick would reach the site as "localhost" and be answered
  // as a request for no site at all.
  it('sends the Host header it is given and does not follow redirects', async () => {
    const server = createServer((req, res) => {
      if (req.url === '/go') {
        res.writeHead(307, { Location: '/elsewhere' })
        res.end()
        return
      }
      res.end(req.headers.host)
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const port = (server.address() as AddressInfo).port
    try {
      const ok = await realSystem.local({ port, path: '/', headers: { Host: 'shop.example.com' }, timeoutMs: 5_000 })
      expect(ok).toEqual({ status: 200, body: 'shop.example.com' })
      const redirect = await realSystem.local({ port, path: '/go', headers: { Host: 'shop.example.com' }, timeoutMs: 5_000 })
      expect(redirect.status).toBe(307)
    } finally {
      server.close()
    }
  })
})

describe('realSystem.local against a site bound the way units.ts binds it', () => {
  // The site starts with `-H localhost`; health checks and cron ticks must reach it
  // however the machine resolves that name, and it must not be open to the network.
  it('reaches a server listening on localhost, which is loopback only', async () => {
    const server = createServer((req, res) => res.end(req.headers.host))
    await new Promise<void>((r) => server.listen(0, 'localhost', r))
    const address = server.address() as AddressInfo
    try {
      expect(['127.0.0.1', '::1']).toContain(address.address)
      const ok = await realSystem.local({ port: address.port, path: '/', headers: { Host: 'shop.example.com' }, timeoutMs: 5_000 })
      expect(ok).toEqual({ status: 200, body: 'shop.example.com' })
    } finally {
      server.close()
    }
  })
})

describe('realSystem.run', () => {
  it('streams lines and reports the exit code', async () => {
    const lines: string[] = []
    const result = await realSystem.run(process.execPath, ['-e', 'console.log("one"); console.error("two"); process.exit(3)'], {
      onLine: (l) => lines.push(l),
    })
    expect(result.code).toBe(3)
    expect(lines.sort()).toEqual(['one', 'two'])
  })
})

describe('parsePasswd', () => {
  it('finds a user', () => {
    expect(parsePasswd('root:x:0:0:root:/root:/bin/bash\ncactus-shop:x:998:997::/srv/cactus/shop/home:/usr/sbin/nologin\n', 'cactus-shop')).toEqual({
      uid: 998,
      gid: 997,
      home: '/srv/cactus/shop/home',
    })
    expect(parsePasswd('root:x:0:0:root:/root:/bin/bash\n', 'nobody-here')).toBeNull()
  })
})
