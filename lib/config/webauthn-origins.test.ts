import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getWebAuthnOrigins } from './env'

describe('getWebAuthnOrigins', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SITE_URL', 'https://example.co.uk/')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is SITE_URL alone with no direct domains', () => {
    vi.stubEnv('CACTUS_HOST_DIRECT_HOSTS', '')
    expect(getWebAuthnOrigins()).toEqual(['https://example.co.uk'])
  })

  it('adds direct domains under the RP ID and leaves out ones the browser would never sign for', () => {
    vi.stubEnv('CACTUS_HOST_DIRECT_HOSTS', 'Books.Example.co.uk, other.example.com, notexample.co.uk')
    expect(getWebAuthnOrigins()).toEqual(['https://example.co.uk', 'https://books.example.co.uk'])
  })

  it('does not list SITE_URL twice', () => {
    vi.stubEnv('CACTUS_HOST_DIRECT_HOSTS', 'example.co.uk')
    expect(getWebAuthnOrigins()).toEqual(['https://example.co.uk'])
  })

  it('stays on localhost in development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('CACTUS_HOST_DIRECT_HOSTS', 'books.example.co.uk')
    expect(getWebAuthnOrigins()).toEqual(['http://localhost:3000'])
  })
})
