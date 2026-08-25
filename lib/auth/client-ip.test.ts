import { describe, it, expect } from 'vitest'
import { clientIpFromHeaders } from './rate-limit'

function headersFrom(map: Record<string, string>) {
  const lower = Object.fromEntries(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v]))
  return (name: string) => lower[name.toLowerCase()] ?? null
}

describe('clientIpFromHeaders', () => {
  it('takes the last x-forwarded-for hop, not the first', () => {
    // The leftmost entry is whatever the caller typed. Trusting it let a
    // rotating header walk through every per-IP limit.
    const get = headersFrom({ 'x-forwarded-for': '9.9.9.9, 203.0.113.7' })
    expect(clientIpFromHeaders(get)).toBe('203.0.113.7')
  })

  it('falls back to x-real-ip with no forwarded chain', () => {
    expect(clientIpFromHeaders(headersFrom({ 'x-real-ip': '203.0.113.7' }))).toBe('203.0.113.7')
  })

  it('reports unknown rather than guessing', () => {
    expect(clientIpFromHeaders(headersFrom({}))).toBe('unknown')
  })

  describe('behind Cloudflare', () => {
    // The last hop is Cloudflare's edge, so without this every visitor through
    // one Cloudflare location shares a rate-limit bucket and one person getting
    // their password wrong locks out the region.
    const get = headersFrom({
      'cf-connecting-ip': '198.51.100.42',
      'x-forwarded-for': '198.51.100.42, 172.71.0.9',
    })

    it('ignores cf-connecting-ip unless the owner said the site is behind Cloudflare', () => {
      expect(clientIpFromHeaders(get)).toBe('172.71.0.9')
      expect(clientIpFromHeaders(get, { trustCloudflare: false })).toBe('172.71.0.9')
    })

    it('uses cf-connecting-ip once they have', () => {
      expect(clientIpFromHeaders(get, { trustCloudflare: true })).toBe('198.51.100.42')
    })

    it('still finds an address when the header is trusted but absent', () => {
      const noCf = headersFrom({ 'x-forwarded-for': '9.9.9.9, 203.0.113.7' })
      expect(clientIpFromHeaders(noCf, { trustCloudflare: true })).toBe('203.0.113.7')
    })

    it('does not treat a blank cf-connecting-ip as an address', () => {
      const blank = headersFrom({ 'cf-connecting-ip': '   ', 'x-forwarded-for': '9.9.9.9, 203.0.113.7' })
      expect(clientIpFromHeaders(blank, { trustCloudflare: true })).toBe('203.0.113.7')
    })
  })
})
