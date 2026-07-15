import { describe, it, expect, afterEach } from 'vitest'
import { checkRestoredMediaStorage } from './media-check'
import { envKeysForProvider } from '@/lib/media/providers'

// A fake db whose GROUP BY query returns whatever rows the test hands it.
function fakeDb(rows: { provider: string | null; count: bigint }[]) {
  return {
    $queryRawUnsafe: async <T>() => rows as unknown as T,
  }
}

const B2_KEYS = envKeysForProvider('B2')

function setB2Configured(configured: boolean) {
  for (const key of B2_KEYS) {
    if (configured) process.env[key] = 'x'
    else delete process.env[key]
  }
}

describe('checkRestoredMediaStorage', () => {
  const saved = { ...process.env }
  afterEach(() => {
    // Restore only the B2 keys we touched, leaving the rest of the env intact.
    for (const key of B2_KEYS) {
      if (key in saved) process.env[key] = saved[key]
      else delete process.env[key]
    }
  })

  it('warns when restored media uses a provider this install has no credentials for', async () => {
    setB2Configured(false)
    const warnings = await checkRestoredMediaStorage(fakeDb([{ provider: 'B2', count: 3n }]))
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('3 media files')
  })

  it('stays silent when the provider IS configured (the same-site rollback case)', async () => {
    setB2Configured(true)
    const warnings = await checkRestoredMediaStorage(fakeDb([{ provider: 'B2', count: 3n }]))
    expect(warnings).toEqual([])
  })

  it('uses the singular for a single unreachable file', async () => {
    setB2Configured(false)
    const warnings = await checkRestoredMediaStorage(fakeDb([{ provider: 'B2', count: 1n }]))
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('1 media file is stored')
  })

  it('ignores rows with no provider and empty groups', async () => {
    setB2Configured(false)
    expect(await checkRestoredMediaStorage(fakeDb([{ provider: null, count: 9n }]))).toEqual([])
    expect(await checkRestoredMediaStorage(fakeDb([]))).toEqual([])
  })
})
