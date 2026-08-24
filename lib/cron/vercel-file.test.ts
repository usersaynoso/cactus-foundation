import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { buildVercelJson, DISPATCH_PATH, DISPATCH_SCHEDULE, VERCEL_JSON_PATH } from './vercel-file'

describe('vercel.json', () => {
  // The tracked file is what a brand-new install inherits; the builder is what the core
  // update and the registry sync write into an existing one. If they drift, half the
  // estate schedules something the other half does not.
  it('matches the file tracked in this repo, byte for byte', () => {
    const onDisk = readFileSync(join(process.cwd(), VERCEL_JSON_PATH), 'utf8')
    expect(onDisk).toBe(buildVercelJson())
  })

  it('registers exactly one cron - the dispatcher', () => {
    const parsed = JSON.parse(buildVercelJson()) as { crons: Array<{ path: string; schedule: string }> }
    // More than one is what breaks a Hobby install, which allows two per project and
    // would refuse to deploy at all once core plus modules declared more.
    expect(parsed.crons).toEqual([{ path: DISPATCH_PATH, schedule: DISPATCH_SCHEDULE }])
  })

  it('points at a route that exists', () => {
    const routePath = join(process.cwd(), 'app', 'api', 'cron', 'dispatch', 'route.ts')
    expect(() => readFileSync(routePath, 'utf8')).not.toThrow()
    expect(DISPATCH_PATH).toBe('/api/cron/dispatch')
  })
})
