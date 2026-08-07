import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The one behaviour worth pinning: this mints a secret rather than blocking, and it
// NEVER overwrites one that already exists. Rotating CRON_SECRET underneath a live
// project silently breaks every scheduled job on it until the next deploy, so the
// "already there" paths matter more than the happy one.

const getVercelEnvVarKeys = vi.fn()
const upsertVercelEnvVar = vi.fn()

vi.mock('./env', () => ({
  getVercelEnvVarKeys: (...args: unknown[]) => getVercelEnvVarKeys(...args),
  upsertVercelEnvVar: (...args: unknown[]) => upsertVercelEnvVar(...args),
}))

import { ensureCronSecret, cronSecretSatisfied } from './cron-secret'

const ENV_KEYS = ['CRON_SECRET', 'VERCEL', 'VERCEL_API_TOKEN', 'VERCEL_PROJECT_ID'] as const
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
  getVercelEnvVarKeys.mockReset()
  upsertVercelEnvVar.mockReset()
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
    expect(getVercelEnvVarKeys).not.toHaveBeenCalled()
    expect(upsertVercelEnvVar).not.toHaveBeenCalled()
  })

  it('skips local-development mode, where there is no project and no crons', async () => {
    setEnv({ VERCEL: undefined, VERCEL_API_TOKEN: 't', VERCEL_PROJECT_ID: 'p' })
    await expect(ensureCronSecret()).resolves.toBe('skipped')
    expect(upsertVercelEnvVar).not.toHaveBeenCalled()
  })

  it('reports unavailable without Vercel credentials', async () => {
    setEnv({ VERCEL: '1', VERCEL_API_TOKEN: undefined, VERCEL_PROJECT_ID: undefined })
    await expect(ensureCronSecret()).resolves.toBe('unavailable')
    expect(upsertVercelEnvVar).not.toHaveBeenCalled()
  })

  it('mints and writes a 64-char hex secret when the project has none', async () => {
    setEnv({ VERCEL: '1', VERCEL_API_TOKEN: 't', VERCEL_PROJECT_ID: 'p' })
    getVercelEnvVarKeys.mockResolvedValue(['DATABASE_URL', 'SESSION_SECRET'])

    await expect(ensureCronSecret()).resolves.toBe('provisioned')
    expect(upsertVercelEnvVar).toHaveBeenCalledTimes(1)
    const [token, projectId, key, value] = upsertVercelEnvVar.mock.calls[0] as string[]
    expect([token, projectId, key]).toEqual(['t', 'p', 'CRON_SECRET'])
    expect(value).toMatch(/^[0-9a-f]{64}$/)
  })

  it('leaves an existing project secret alone when this deployment simply predates it', async () => {
    setEnv({ VERCEL: '1', VERCEL_API_TOKEN: 't', VERCEL_PROJECT_ID: 'p' })
    getVercelEnvVarKeys.mockResolvedValue(['CRON_SECRET'])

    await expect(ensureCronSecret()).resolves.toBe('pending')
    expect(upsertVercelEnvVar).not.toHaveBeenCalled()
  })

  it('swallows a Vercel API failure rather than aborting the caller', async () => {
    setEnv({ VERCEL: '1', VERCEL_API_TOKEN: 't', VERCEL_PROJECT_ID: 'p' })
    getVercelEnvVarKeys.mockRejectedValue(new Error('Vercel API list env vars failed (403)'))

    await expect(ensureCronSecret()).resolves.toBe('unavailable')
  })

  it('generates a different secret each time', async () => {
    setEnv({ VERCEL: '1', VERCEL_API_TOKEN: 't', VERCEL_PROJECT_ID: 'p' })
    getVercelEnvVarKeys.mockResolvedValue([])

    await ensureCronSecret()
    await ensureCronSecret()
    const [, , , first] = upsertVercelEnvVar.mock.calls[0] as string[]
    const [, , , second] = upsertVercelEnvVar.mock.calls[1] as string[]
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
