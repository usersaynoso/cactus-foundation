import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The one behaviour worth pinning: this mints a secret rather than blocking, and it
// NEVER overwrites one that already exists. Rotating CRON_SECRET underneath a live
// project silently breaks every scheduled job on it until the next deploy, so the
// "already there" paths matter more than the happy one.

const getHostEnvVarKeys = vi.fn()
const upsertHostEnvVar = vi.fn()

vi.mock('./env', () => ({
  getHostEnvVarKeys: (...args: unknown[]) => getHostEnvVarKeys(...args),
  upsertHostEnvVar: (...args: unknown[]) => upsertHostEnvVar(...args),
}))

import { ensureCronSecret, cronSecretSatisfied } from './cron-secret'

const ENV_KEYS = [
  'CRON_SECRET',
  'VERCEL',
  'VERCEL_API_TOKEN',
  'VERCEL_PROJECT_ID',
  'NETLIFY',
  'CACTUS_HOSTING_PROVIDER',
  'NETLIFY_API_TOKEN',
  'NETLIFY_SITE_ID',
] as const
const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {}

function setEnv(vars: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
  for (const key of ENV_KEYS) {
    const value = vars[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key]
  getHostEnvVarKeys.mockReset()
  upsertHostEnvVar.mockReset()
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key] as string
  }
})

describe('ensureCronSecret', () => {
  it('does nothing when the running deployment already has one', async () => {
    setEnv({ CRON_SECRET: 'already-here', VERCEL: '1', VERCEL_API_TOKEN: 't', VERCEL_PROJECT_ID: 'p' })
    await expect(ensureCronSecret()).resolves.toBe('present')
    expect(getHostEnvVarKeys).not.toHaveBeenCalled()
    expect(upsertHostEnvVar).not.toHaveBeenCalled()
  })

  it('skips local-development mode, where there is no project and no crons', async () => {
    setEnv({ VERCEL: undefined, VERCEL_API_TOKEN: 't', VERCEL_PROJECT_ID: 'p' })
    await expect(ensureCronSecret()).resolves.toBe('skipped')
    expect(upsertHostEnvVar).not.toHaveBeenCalled()
  })

  it('reports unavailable without hosting credentials', async () => {
    setEnv({ VERCEL: '1', VERCEL_API_TOKEN: undefined, VERCEL_PROJECT_ID: undefined })
    await expect(ensureCronSecret()).resolves.toBe('unavailable')
    expect(upsertHostEnvVar).not.toHaveBeenCalled()
  })

  it('mints and writes a 64-char hex secret when the project has none', async () => {
    setEnv({ VERCEL: '1', VERCEL_API_TOKEN: 't', VERCEL_PROJECT_ID: 'p' })
    getHostEnvVarKeys.mockResolvedValue(['DATABASE_URL', 'SESSION_SECRET'])

    await expect(ensureCronSecret()).resolves.toBe('provisioned')
    expect(upsertHostEnvVar).toHaveBeenCalledTimes(1)
    const [creds, key, value] = upsertHostEnvVar.mock.calls[0] as [unknown, string, string]
    expect(creds).toEqual({ provider: 'vercel', token: 't', siteId: 'p' })
    expect(key).toBe('CRON_SECRET')
    expect(value).toMatch(/^[0-9a-f]{64}$/)
  })

  it('writes to the Netlify site when the site runs on Netlify', async () => {
    setEnv({ CACTUS_HOSTING_PROVIDER: 'netlify', NETLIFY_API_TOKEN: 'nt', NETLIFY_SITE_ID: 'ns' })
    getHostEnvVarKeys.mockResolvedValue([])

    await expect(ensureCronSecret()).resolves.toBe('provisioned')
    const [creds] = upsertHostEnvVar.mock.calls[0] as [unknown]
    expect(creds).toEqual({ provider: 'netlify', token: 'nt', siteId: 'ns' })
  })

  it('ignores Vercel credentials on a Netlify site', async () => {
    setEnv({ NETLIFY: 'true', VERCEL_API_TOKEN: 't', VERCEL_PROJECT_ID: 'p' })
    await expect(ensureCronSecret()).resolves.toBe('unavailable')
    expect(upsertHostEnvVar).not.toHaveBeenCalled()
  })

  it('leaves an existing project secret alone when this deployment simply predates it', async () => {
    setEnv({ VERCEL: '1', VERCEL_API_TOKEN: 't', VERCEL_PROJECT_ID: 'p' })
    getHostEnvVarKeys.mockResolvedValue(['CRON_SECRET'])

    await expect(ensureCronSecret()).resolves.toBe('pending')
    expect(upsertHostEnvVar).not.toHaveBeenCalled()
  })

  it('swallows a Vercel API failure rather than aborting the caller', async () => {
    setEnv({ VERCEL: '1', VERCEL_API_TOKEN: 't', VERCEL_PROJECT_ID: 'p' })
    getHostEnvVarKeys.mockRejectedValue(new Error('Vercel API list env vars failed (403)'))

    await expect(ensureCronSecret()).resolves.toBe('unavailable')
  })

  it('generates a different secret each time', async () => {
    setEnv({ VERCEL: '1', VERCEL_API_TOKEN: 't', VERCEL_PROJECT_ID: 'p' })
    getHostEnvVarKeys.mockResolvedValue([])

    await ensureCronSecret()
    await ensureCronSecret()
    const [, , first] = upsertHostEnvVar.mock.calls[0] as string[]
    const [, , second] = upsertHostEnvVar.mock.calls[1] as string[]
    expect(first).not.toBe(second)
  })
})

describe('cronSecretSatisfied', () => {
  it('treats every outcome but unavailable as good enough to install on', () => {
    expect(cronSecretSatisfied('present')).toBe(true)
    expect(cronSecretSatisfied('provisioned')).toBe(true)
    expect(cronSecretSatisfied('pending')).toBe(true)
    expect(cronSecretSatisfied('skipped')).toBe(true)
    expect(cronSecretSatisfied('unavailable')).toBe(false)
  })
})
