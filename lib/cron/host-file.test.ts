import { describe, it, expect, afterEach, vi } from 'vitest'
import { hostCronFile } from './host-file'
import { buildVercelJson, dispatchScheduleForInterval } from './vercel-file'
import { buildNetlifyToml } from './netlify-file'

afterEach(() => vi.unstubAllEnvs())

function host(vars: { VERCEL?: string; NETLIFY?: string; CACTUS_HOSTING_PROVIDER?: string }) {
  vi.stubEnv('VERCEL', vars.VERCEL ?? '')
  vi.stubEnv('NETLIFY', vars.NETLIFY ?? '')
  vi.stubEnv('CACTUS_HOSTING_PROVIDER', vars.CACTUS_HOSTING_PROVIDER ?? '')
}

describe('hostCronFile', () => {
  // Every existing install is on Vercel. Whatever Netlify support adds, the file a
  // Vercel site's syncs write must stay byte for byte what they wrote before it.
  it('gives a Vercel site exactly the vercel.json it always had', () => {
    host({ VERCEL: '1', CACTUS_HOSTING_PROVIDER: 'vercel' })
    const schedule = dispatchScheduleForInterval(5)
    expect(hostCronFile(schedule)).toEqual({ path: 'vercel.json', content: buildVercelJson(schedule) })
  })

  it('answers vercel.json locally, as before', () => {
    host({})
    expect(hostCronFile('*/30 * * * *').path).toBe('vercel.json')
  })

  it('gives a Netlify site netlify.toml', () => {
    host({ CACTUS_HOSTING_PROVIDER: 'netlify' })
    expect(hostCronFile('*/10 * * * *')).toEqual({ path: 'netlify.toml', content: buildNetlifyToml('*/10 * * * *') })
  })
})
