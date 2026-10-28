import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  detectHostingProvider,
  getHostingCredentials,
  missingCredentialsMessage,
  resolveHostingCredentials,
} from './provider'

const KEYS = [
  'VERCEL',
  'NETLIFY',
  'CACTUS_HOSTING_PROVIDER',
  'VERCEL_API_TOKEN',
  'VERCEL_PROJECT_ID',
  'NETLIFY_API_TOKEN',
  'NETLIFY_SITE_ID',
]

function env(vars: Record<string, string>) {
  for (const key of KEYS) vi.stubEnv(key, vars[key] ?? '')
}

afterEach(() => vi.unstubAllEnvs())

describe('detectHostingProvider', () => {
  it('reads Vercel from VERCEL=1', () => {
    env({ VERCEL: '1' })
    expect(detectHostingProvider()).toBe('vercel')
  })

  // Netlify does not promise NETLIFY to functions at runtime; next.config.ts bakes
  // the build-time answer in, and that has to be enough on its own.
  it('reads Netlify from the baked-in build marker alone', () => {
    env({ CACTUS_HOSTING_PROVIDER: 'netlify' })
    expect(detectHostingProvider()).toBe('netlify')
  })

  it('reads Netlify from NETLIFY=true in a build script', () => {
    env({ NETLIFY: 'true' })
    expect(detectHostingProvider()).toBe('netlify')
  })

  it('is null locally', () => {
    env({})
    expect(detectHostingProvider()).toBeNull()
  })
})

describe('getHostingCredentials', () => {
  it('uses the pair for the platform the site runs on, never the other', () => {
    env({ CACTUS_HOSTING_PROVIDER: 'netlify', VERCEL_API_TOKEN: 'v', VERCEL_PROJECT_ID: 'vp' })
    expect(getHostingCredentials()).toBeNull()
    env({ CACTUS_HOSTING_PROVIDER: 'netlify', NETLIFY_API_TOKEN: 'n', NETLIFY_SITE_ID: 'ns' })
    expect(getHostingCredentials()).toEqual({ provider: 'netlify', token: 'n', siteId: 'ns' })
  })

  it('falls back to whichever pair is set locally, Vercel first', () => {
    env({ VERCEL_API_TOKEN: 'v', VERCEL_PROJECT_ID: 'vp', NETLIFY_API_TOKEN: 'n', NETLIFY_SITE_ID: 'ns' })
    expect(getHostingCredentials()?.provider).toBe('vercel')
  })

  it('needs both halves of the pair', () => {
    env({ VERCEL: '1', VERCEL_API_TOKEN: 'v' })
    expect(getHostingCredentials()).toBeNull()
  })
})

describe('resolveHostingCredentials', () => {
  it('prefers what the setup wizard sent over the environment', () => {
    env({ VERCEL: '1', VERCEL_API_TOKEN: 'env', VERCEL_PROJECT_ID: 'envp' })
    expect(resolveHostingCredentials({ provider: 'netlify', token: 'n', siteId: 'ns' })).toEqual({
      provider: 'netlify',
      token: 'n',
      siteId: 'ns',
    })
  })

  it('fills gaps from the environment for the same platform', () => {
    env({ VERCEL: '1', VERCEL_API_TOKEN: 'env', VERCEL_PROJECT_ID: 'envp' })
    expect(resolveHostingCredentials({ siteId: 'picked' })).toEqual({
      provider: 'vercel',
      token: 'env',
      siteId: 'picked',
    })
  })

  it('ignores a provider name it does not know', () => {
    env({ VERCEL: '1' })
    expect(resolveHostingCredentials({ provider: 'heroku', token: 't', siteId: 's' })?.provider).toBe('vercel')
  })
})

describe('missingCredentialsMessage', () => {
  it('names the right pair', () => {
    expect(missingCredentialsMessage('netlify')).toBe('NETLIFY_API_TOKEN and NETLIFY_SITE_ID are required')
    expect(missingCredentialsMessage('vercel')).toBe('VERCEL_API_TOKEN and VERCEL_PROJECT_ID are required')
  })
})
