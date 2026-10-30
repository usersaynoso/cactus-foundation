import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildServerCronJson, SERVER_CRON_PATH } from '@/lib/cron/server-file'
import { buildVercelJson } from '@/lib/cron/vercel-file'
import { DISPATCH_PATH as CORE_DISPATCH_PATH, DISPATCH_SCHEDULE, dispatchScheduleForInterval } from '@/lib/cron/vercel-file'
import { CRON_FILE, cronMatches, DEFAULT_SCHEDULE, DISPATCH_PATH, parseCron, readReleaseSchedule } from './cron.ts'

const at = (iso: string) => new Date(iso)

// cactus-host runs without the app's path alias, so these are copies. Copies that
// drift would mean a site whose tick nobody reads.
describe('agrees with core', () => {
  it('on the file, the path and the default tick', () => {
    expect(CRON_FILE).toBe(SERVER_CRON_PATH)
    expect(DISPATCH_PATH).toBe(CORE_DISPATCH_PATH)
    expect(DEFAULT_SCHEDULE).toBe(DISPATCH_SCHEDULE)
  })
})

describe('cron expressions', () => {
  it('fires a */N tick on the minutes it names and no others', () => {
    const cron = parseCron('*/15 * * * *')
    expect(cronMatches(cron, at('2026-10-30T10:00:00Z'))).toBe(true)
    expect(cronMatches(cron, at('2026-10-30T10:45:59Z'))).toBe(true)
    expect(cronMatches(cron, at('2026-10-30T10:44:00Z'))).toBe(false)
  })

  it('reads every tick Cactus can write', () => {
    for (const minutes of [1, 5, 10, 15, 20, 30, 60]) {
      expect(() => parseCron(dispatchScheduleForInterval(minutes))).not.toThrow()
    }
    expect(cronMatches(parseCron('* * * * *'), at('2026-10-30T03:17:00Z'))).toBe(true)
  })

  it('takes lists, ranges and day fields the usual way', () => {
    const cron = parseCron('0 9-17 * * 1-5')
    expect(cronMatches(cron, at('2026-10-30T09:00:00Z'))).toBe(true) // a Friday
    expect(cronMatches(cron, at('2026-11-01T09:00:00Z'))).toBe(false) // a Sunday
    expect(cronMatches(parseCron('0 0 * * 7'), at('2026-11-01T00:00:00Z'))).toBe(true)
    expect(cronMatches(parseCron('0 0 1 * 1'), at('2026-11-02T00:00:00Z'))).toBe(true) // Monday, not the 1st
  })

  it('refuses nonsense', () => {
    expect(() => parseCron('* * * *')).toThrow()
    expect(() => parseCron('61 * * * *')).toThrow()
    expect(() => parseCron('*/0 * * * *')).toThrow()
  })
})

describe('readReleaseSchedule', () => {
  const dir = () => mkdtempSync(join(tmpdir(), 'cactus-host-cron-'))

  it('reads the file Cactus writes', () => {
    const release = dir()
    writeFileSync(join(release, 'cactus-host.json'), buildServerCronJson('*/5 * * * *'))
    expect(readReleaseSchedule(release)).toBe('*/5 * * * *')
  })

  it('keeps a moved site\'s Vercel cadence when it has no cactus-host.json', () => {
    const release = dir()
    writeFileSync(join(release, 'vercel.json'), buildVercelJson('*/15 * * * *'))
    expect(readReleaseSchedule(release)).toBe('*/15 * * * *')
  })

  it('prefers cactus-host.json over vercel.json', () => {
    const release = dir()
    writeFileSync(join(release, 'vercel.json'), buildVercelJson('*/15 * * * *'))
    writeFileSync(join(release, 'cactus-host.json'), buildServerCronJson('*/5 * * * *'))
    expect(readReleaseSchedule(release)).toBe('*/5 * * * *')
  })

  it('does not fall through to vercel.json when cactus-host.json is broken', () => {
    const release = dir()
    writeFileSync(join(release, 'vercel.json'), buildVercelJson('*/15 * * * *'))
    writeFileSync(join(release, 'cactus-host.json'), 'not json')
    expect(readReleaseSchedule(release, () => {})).toBe(DEFAULT_SCHEDULE)
  })

  it('uses the default when vercel.json has no dispatcher entry or is unreadable', () => {
    const none = dir()
    writeFileSync(join(none, 'vercel.json'), '{"crons":[{"path":"/api/other","schedule":"*/15 * * * *"}]}')
    expect(readReleaseSchedule(none, () => {})).toBe(DEFAULT_SCHEDULE)
    const broken = dir()
    writeFileSync(join(broken, 'vercel.json'), '{{')
    expect(readReleaseSchedule(broken, () => {})).toBe(DEFAULT_SCHEDULE)
  })

  it('falls back to the default when the file is missing or broken', () => {
    expect(readReleaseSchedule(dir())).toBe(DEFAULT_SCHEDULE)
    const release = dir()
    writeFileSync(join(release, 'cactus-host.json'), '{"crons":[{"path":"/api/cron/dispatch","schedule":"nope"}]}')
    const warnings: string[] = []
    expect(readReleaseSchedule(release, (m) => warnings.push(m))).toBe(DEFAULT_SCHEDULE)
    expect(warnings).toHaveLength(1)
  })
})
