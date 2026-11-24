import { describe, expect, it } from 'vitest'
import { sanitizeRedirect } from './redirect'

// Every ?redirect= a visitor can hand the site goes through this one function
// before anything navigates to it, so it is the open-redirect boundary. The
// browser is the judge of where a value really goes: each refusal below is
// checked against the WHATWG URL parser, which is what window.location and a
// Location header both use.

const resolve = (value: string) => new URL(value, 'https://site.test').host

describe('sanitizeRedirect', () => {
  it('keeps a same-site path, query string and all', () => {
    expect(sanitizeRedirect('/account')).toBe('/account')
    expect(sanitizeRedirect('/api/m/tg-finance/v1/auth/app-connect?state=S&redirect_uri=tgfinance%3A%2F%2Fauth')).toBe(
      '/api/m/tg-finance/v1/auth/app-connect?state=S&redirect_uri=tgfinance%3A%2F%2Fauth',
    )
  })

  it('falls back when there is nothing to go to', () => {
    expect(sanitizeRedirect(undefined)).toBe('/')
    expect(sanitizeRedirect(null, '/account')).toBe('/account')
    expect(sanitizeRedirect('', '/account')).toBe('/account')
  })

  it('refuses anything that is not a path on this site', () => {
    for (const bad of [
      'https://evil.test/',
      'http://evil.test',
      '//evil.test',
      '/\\evil.test',
      'evil.test',
      'javascript:alert(1)',
      'data:text/html,hi',
      'tgfinance://auth',
      '/x?next=https://evil.test',
      ' /account',
    ]) {
      expect(sanitizeRedirect(bad, '/fallback'), bad).toBe('/fallback')
    }
  })

  // The URL parser deletes tabs and newlines from anywhere in a URL before it
  // reads it, so "/<tab>/evil.test" is "//evil.test" by the time the browser
  // acts on it. None of these start with "//" as written, which is what let
  // them past the older checks.
  it('refuses control characters the browser would strip into "//host"', () => {
    for (const bad of ['/\t/evil.test', '/\n/evil.test', '/\r\n/evil.test', '/\t\\evil.test', '/\u0000/evil.test', '/\u007f']) {
      expect(sanitizeRedirect(bad, '/fallback'), JSON.stringify(bad)).toBe('/fallback')
    }
    // Proof the first one really was an escape before the fix.
    expect(resolve('/\t/evil.test')).toBe('evil.test')
  })

  it('leaves percent-encoded tricks as harmless same-site paths', () => {
    for (const odd of ['/%2F%2Fevil.test', '/%5Cevil.test', '/%09/evil.test', '/.//evil.test']) {
      const kept = sanitizeRedirect(odd, '/fallback')
      expect(kept).toBe(odd)
      expect(resolve(kept)).toBe('site.test')
    }
  })
})
