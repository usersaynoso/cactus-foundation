import { describe, expect, it } from 'vitest'
import { describeAction, describeUserAgent, formatRelative } from './member-detail-format'

describe('describeUserAgent', () => {
  it('names the browser and system', () => {
    expect(describeUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36')).toBe('Chrome on macOS')
    expect(describeUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toBe('Safari on iOS')
    expect(describeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0')).toBe('Edge on Windows')
  })

  it('copes with nothing to go on', () => {
    expect(describeUserAgent(null)).toBe('Unknown device')
    expect(describeUserAgent('curl/8.0')).toBe('curl/8.0')
  })
})

describe('describeAction', () => {
  it('says known actions in words, bulk ones too', () => {
    expect(describeAction('verify_email')).toBe('Marked email as verified')
    expect(describeAction('bulk_untrust')).toBe('Removed trusted flag (in bulk)')
  })

  it('falls back to the key itself for a module action it has never heard of', () => {
    expect(describeAction('shop.order_merged')).toBe('Shop order merged')
  })
})

describe('formatRelative', () => {
  const now = Date.parse('2026-11-13T12:00:00Z')
  it('reads recent and older times naturally', () => {
    expect(formatRelative(null, now)).toBe('Never')
    expect(formatRelative('2026-11-13T11:59:30Z', now)).toBe('just now')
    expect(formatRelative('2026-11-10T12:00:00Z', now)).toBe('3 days ago')
  })
})
