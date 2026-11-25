import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The unauthenticated setup routes act with the site's own hosting credentials, so
// the one thing this gate must never do is read "database unreachable" as "never set
// up". These pin that down.

const findUnique = vi.fn()
vi.mock('@/lib/db/prisma', () => ({ prisma: { siteConfig: { findUnique } } }))

import { readSetupGate, setupClosedResponse } from './setup-gate'

const ORIGINAL_URL = process.env.DATABASE_URL

beforeEach(() => {
  findUnique.mockReset()
  process.env.DATABASE_URL = 'postgresql://site:pw@db.example/site'
})

afterEach(() => {
  if (ORIGINAL_URL === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = ORIGINAL_URL
})

describe('readSetupGate', () => {
  it('is open with no DATABASE_URL, without touching the database', async () => {
    delete process.env.DATABASE_URL
    expect(await readSetupGate()).toBe('open')
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('is complete when the row says so', async () => {
    findUnique.mockResolvedValue({ setupCompleted: true })
    expect(await readSetupGate()).toBe('complete')
  })

  it('is open when the row says not, or there is no row yet', async () => {
    findUnique.mockResolvedValue({ setupCompleted: false })
    expect(await readSetupGate()).toBe('open')
    findUnique.mockResolvedValue(null)
    expect(await readSetupGate()).toBe('open')
  })

  it('is open when the schema has not been migrated yet', async () => {
    findUnique.mockRejectedValue(Object.assign(new Error('The table `public.SiteConfig` does not exist in the current database.'), { code: 'P2021' }))
    expect(await readSetupGate()).toBe('open')
  })

  it('is UNAVAILABLE, not open, when the database cannot be reached', async () => {
    findUnique.mockRejectedValue(Object.assign(new Error("Can't reach database server"), { code: 'P1001' }))
    expect(await readSetupGate()).toBe('unavailable')
  })
})

describe('setupClosedResponse', () => {
  it('lets the request through while setup is open', async () => {
    findUnique.mockResolvedValue({ setupCompleted: false })
    expect(await setupClosedResponse()).toBeNull()
  })

  it('answers 403 once setup is complete', async () => {
    findUnique.mockResolvedValue({ setupCompleted: true })
    expect((await setupClosedResponse())?.status).toBe(403)
  })

  it('answers 503 during an outage rather than opening the wizard', async () => {
    findUnique.mockRejectedValue(Object.assign(new Error('terminating connection due to administrator command'), { code: 'P1017' }))
    expect((await setupClosedResponse())?.status).toBe(503)
  })
})
