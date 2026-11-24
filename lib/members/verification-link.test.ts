import { describe, expect, it } from 'vitest'
import { buildVerificationUrl } from './verification-link'

// The emailed verification link carries the ?redirect= the member registered
// with, so the link that verifies and signs them in ends where they started -
// a native app's hand-off page, say. With no redirect it is the same link as
// ever, byte for byte.

const TOKEN = 'b'.repeat(64)
const PLAIN = `https://example.test/account/verify-email?token=${TOKEN}`

describe('buildVerificationUrl', () => {
  it('is unchanged when there is no redirect', () => {
    expect(buildVerificationUrl('https://example.test/', 'account', TOKEN)).toBe(PLAIN)
    expect(buildVerificationUrl('https://example.test', 'account', TOKEN, null)).toBe(PLAIN)
    expect(buildVerificationUrl('https://example.test', 'account', TOKEN, '')).toBe(PLAIN)
  })

  it('appends a same-site redirect, encoded, and it reads back intact', () => {
    const target = '/api/m/tg-finance/v1/auth/app-connect?state=S&code_challenge=C&redirect_uri=tgfinance%3A%2F%2Fauth'
    const url = new URL(buildVerificationUrl('https://example.test', 'account', TOKEN, target))
    expect(url.pathname).toBe('/account/verify-email')
    expect(url.searchParams.get('token')).toBe(TOKEN)
    expect(url.searchParams.get('redirect')).toBe(target)
    expect([...url.searchParams.keys()]).toEqual(['token', 'redirect'])
  })

  it('leaves off anything that could send the member to another site', () => {
    for (const bad of [
      'https://evil.test/',
      '//evil.test',
      '/\\evil.test',
      '/\t/evil.test',
      'evil.test',
      'javascript:alert(1)',
      '/x?u=https://evil.test',
      '/app-connect?redirect_uri=tgfinance://auth',
    ]) {
      expect(buildVerificationUrl('https://example.test', 'account', TOKEN, bad), JSON.stringify(bad)).toBe(PLAIN)
    }
  })
})
