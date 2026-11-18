import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

// Every name the code under test resolves goes through this stand-in, so the
// tests never touch real DNS and can make a name answer whatever they like -
// including the DNS-rebinding case, where a public-looking name answers with a
// private address.
const answers = new Map<string, Array<{ address: string; family: number }>>()
vi.mock('node:dns', () => ({
  lookup: (
    hostname: string,
    _opts: unknown,
    cb: (err: NodeJS.ErrnoException | null, addresses: Array<{ address: string; family: number }>) => void,
  ) => {
    const found = answers.get(hostname)
    if (!found) return cb(Object.assign(new Error('not found'), { code: 'ENOTFOUND' }), [])
    return cb(null, found)
  },
}))

const { isPrivateAddress, parsePublicUrl, safeFetch, UnsafeUrlError } = await import('@/lib/security/safe-fetch')

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '198.18.0.1',
    '::1', '::', 'fe80::1', 'fd00::1', 'fc00::1', 'ff02::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '64:ff9b::7f00:1', '2002:7f00:1::',
    '[::1]', 'not-an-ip', '',
  ])('refuses %s', (address) => {
    expect(isPrivateAddress(address)).toBe(true)
  })

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.128.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])(
    'allows %s',
    (address) => {
      expect(isPrivateAddress(address)).toBe(false)
    },
  )
})

describe('parsePublicUrl', () => {
  it.each([
    'ftp://example.com/', 'file:///etc/passwd', 'javascript:alert(1)', 'not a url',
    'http://localhost/', 'http://LOCALHOST./', 'http://box.local/', 'http://metadata.internal/',
    'http://127.0.0.1/', 'http://[::1]/', 'http://169.254.169.254/latest/meta-data/',
    'http://user:pass@example.com/', 'http://2130706433/', 'http://0x7f000001/',
  ])('refuses %s', (raw) => {
    expect(() => parsePublicUrl(raw)).toThrow(UnsafeUrlError)
  })

  it('accepts an ordinary public address', () => {
    expect(parsePublicUrl('https://example.com/feed.xml').hostname).toBe('example.com')
  })
})

describe('safeFetch', () => {
  let server: Server
  let port = 0

  beforeAll(async () => {
    // Listens on loopback on purpose: every test below would reach it if the
    // guard let the connection through.
    server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('hello')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as AddressInfo).port
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('refuses a name that resolves to a private address (DNS rebinding)', async () => {
    answers.set('rebind.example', [{ address: '127.0.0.1', family: 4 }])
    await expect(safeFetch(`http://rebind.example:${port}/`)).rejects.toThrow(UnsafeUrlError)
  })

  it('refuses a name with a private address hidden among public ones', async () => {
    answers.set('mixed.example', [
      { address: '93.184.215.14', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ])
    await expect(safeFetch(`http://mixed.example:${port}/`)).rejects.toThrow(UnsafeUrlError)
  })

  it('refuses a literal private address without connecting', async () => {
    await expect(safeFetch(`http://127.0.0.1:${port}/`)).rejects.toThrow(UnsafeUrlError)
  })
})
