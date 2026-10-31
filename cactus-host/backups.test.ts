import { existsSync, readFileSync, statSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { checkFolder, ensureRemote, isDue, lastSlot, parseDestination, parseRcloneConfig, parseSchedule, remoteSpec, backupsFor } from './backups.ts'
import { Databases } from './db.ts'
import { createApiServer } from './http.ts'
import type { BackupSchedule, SiteBackupState } from './protocol.ts'
import { fakeSystem, hostWithSite, testConfig, TEST_TOKEN, withCluster } from './testing.ts'

const at = (iso: string) => Date.parse(iso)
const every = (e: BackupSchedule['every'], hour = 3, minute = 30): BackupSchedule => ({ every: e, hour, minute, keepDays: 30 })

describe('lastSlot and isDue', () => {
  it('daily: today once the time has passed, otherwise yesterday', () => {
    expect(lastSlot(every('daily'), at('2026-10-31T03:30:00Z'))).toBe(at('2026-10-31T03:30:00Z'))
    expect(lastSlot(every('daily'), at('2026-10-31T03:29:59Z'))).toBe(at('2026-10-30T03:30:00Z'))
  })

  it('every 6 or 12 hours, counted from the earliest run of the day', () => {
    expect(lastSlot(every('6h'), at('2026-10-31T10:00:00Z'))).toBe(at('2026-10-31T09:30:00Z'))
    expect(lastSlot(every('6h'), at('2026-10-31T01:00:00Z'))).toBe(at('2026-10-30T21:30:00Z'))
    // 21:00 every twelve hours also runs at 09:00.
    expect(lastSlot(every('12h', 21, 0), at('2026-10-31T10:00:00Z'))).toBe(at('2026-10-31T09:00:00Z'))
    expect(lastSlot(every('12h', 21, 0), at('2026-10-31T08:59:00Z'))).toBe(at('2026-10-30T21:00:00Z'))
  })

  it('weekly: Sundays', () => {
    // 2026-11-01 is a Sunday.
    expect(lastSlot(every('weekly'), at('2026-11-03T12:00:00Z'))).toBe(at('2026-11-01T03:30:00Z'))
    expect(lastSlot(every('weekly'), at('2026-11-01T03:00:00Z'))).toBe(at('2026-10-25T03:30:00Z'))
  })

  it('off never runs', () => {
    expect(lastSlot(every('off'), at('2026-10-31T03:30:00Z'))).toBeNull()
    expect(isDue(every('off'), null, at('2026-10-31T03:30:00Z'))).toBe(false)
  })

  it('runs once per slot, and skips a slot missed by more than an hour', () => {
    const s = every('daily')
    expect(isDue(s, null, at('2026-10-31T03:31:00Z'))).toBe(true)
    expect(isDue(s, at('2026-10-31T03:30:05Z'), at('2026-10-31T03:31:00Z'))).toBe(false)
    expect(isDue(s, at('2026-10-30T03:30:05Z'), at('2026-10-31T03:31:00Z'))).toBe(true)
    expect(isDue(s, at('2026-10-30T03:30:05Z'), at('2026-10-31T05:00:00Z'))).toBe(false)
  })

  it('checks a schedule from the outside world', () => {
    expect(parseSchedule({ every: 'daily', hour: 4, minute: 0, keepDays: 14 })).toEqual({ every: 'daily', hour: 4, minute: 0, keepDays: 14 })
    expect(() => parseSchedule({ every: 'hourly', hour: 4, minute: 0, keepDays: 14 })).toThrow(/must be one of/)
    expect(() => parseSchedule({ every: 'daily', hour: 24, minute: 0, keepDays: 14 })).toThrow(/hour/)
    expect(() => parseSchedule({ every: 'daily', hour: 3, minute: 0, keepDays: 0 })).toThrow(/keepDays/)
  })
})

describe('folders and destinations', () => {
  it('tidies a folder and refuses anything outside the safe set', () => {
    expect(checkFolder(' /Database-Backups/oasis/ ')).toBe('Database-Backups/oasis')
    expect(() => checkFolder('')).toThrow(/Pick a folder/)
    expect(() => checkFolder('a/../b')).toThrow(/letters, digits/)
    expect(() => checkFolder('a b')).toThrow(/letters, digits/)
  })

  it('refuses the public media folder, where a backup would be downloadable', () => {
    expect(() => checkFolder('media/backups')).toThrow(/shown to the public/)
    expect(() => checkFolder('media')).toThrow(/shown to the public/)
    expect(checkFolder('media-backups')).toBe('media-backups')
  })

  it('takes a destination apart', () => {
    expect(parseDestination('b2-deskwell:Deskwell-Office-Furniture/Database-Backups-sys1')).toEqual({
      remote: 'b2-deskwell',
      bucket: 'Deskwell-Office-Furniture',
      folder: 'Database-Backups-sys1',
    })
    expect(parseDestination('b2:bucket-only')).toBeNull()
    expect(parseDestination(null)).toBeNull()
  })
})

describe('rclone remotes', () => {
  const b2Env = new Map([
    ['B2_APPLICATION_KEY_ID', '003abc'],
    ['B2_APPLICATION_KEY', 'K003secret'],
    ['B2_BUCKET_NAME', 'Oasiss'],
  ])

  it('builds a native b2 remote from the site key', () => {
    const spec = remoteSpec('oasis', 'B2', b2Env)
    expect(spec.name).toBe('b2-oasis')
    expect(spec.bucket).toBe('Oasiss')
    expect(spec.fields).toContainEqual(['type', 'b2'])
    expect(spec.fields).toContainEqual(['account', '003abc'])
  })

  it('says which setting is missing', () => {
    expect(() => remoteSpec('oasis', 'B2', new Map([['B2_BUCKET_NAME', 'x-bucket']]))).toThrow(/B2_APPLICATION_KEY_ID is not set/)
    expect(() => remoteSpec('oasis', 'R2', b2Env)).toThrow(/R2_ACCOUNT_ID is not set/)
  })

  it('writes a new remote root-only, keeps what was there, and reuses it next time', () => {
    const path = `${testConfig().stateDir}/rclone.conf`
    const spec = remoteSpec('oasis', 'B2', b2Env)
    expect(ensureRemote(path, spec)).toEqual({ name: 'b2-oasis', created: true })
    expect(statSync(path).mode & 0o777).toBe(0o600)
    expect(ensureRemote(path, spec)).toEqual({ name: 'b2-oasis', created: false })
    const sections = parseRcloneConfig(readFileSync(path, 'utf8'))
    expect([...sections.keys()]).toEqual(['b2-oasis'])
    expect(sections.get('b2-oasis')?.get('key')).toBe('K003secret')
  })

  it('never rewrites a remote of that name holding another key', () => {
    const config = testConfig()
    const path = `${config.stateDir}/rclone.conf`
    const spec = remoteSpec('oasis', 'B2', b2Env)
    ensureRemote(path, spec)
    const other = remoteSpec('oasis', 'B2', new Map([...b2Env, ['B2_APPLICATION_KEY_ID', '003other']]))
    expect(() => ensureRemote(path, other)).toThrow(/uses a different key/)
    expect(parseRcloneConfig(readFileSync(path, 'utf8')).get('b2-oasis')?.get('account')).toBe('003abc')
  })
})

/** A site whose database is `shop` on this server, with its own B2 bucket. */
function siteWithDatabase() {
  const system = fakeSystem()
  withCluster(system, { databases: ['shop'] })
  return hostWithSite({
    system,
    env: {
      DATABASE_URL: 'postgresql://shop:pw@localhost:5432/shop',
      B2_APPLICATION_KEY_ID: '003shop',
      B2_APPLICATION_KEY: 'K003shopsecret',
      B2_BUCKET_NAME: 'Shop-Bucket',
    },
  })
}

describe('a site setting its own backups', () => {
  it('points them at a folder in its own bucket, through its own remote', async () => {
    const ctx = siteWithDatabase()
    const state = await backupsFor(ctx.host).save(ctx.site, {
      storage: 'B2',
      folder: 'Database-Backups',
      schedule: { every: 'daily', hour: 2, minute: 15, keepDays: 14 },
    })
    expect(state).toMatchObject({
      database: 'shop',
      destination: 'b2-shop:Shop-Bucket/Database-Backups',
      location: { remote: 'b2-shop', bucket: 'Shop-Bucket', folder: 'Database-Backups' },
      schedule: { every: 'daily', hour: 2, minute: 15, keepDays: 14 },
      running: false,
    })
    expect(ctx.system.calls.find((c) => c.cmd === 'rclone')?.args).toEqual(['lsf', '--max-depth', '1', '--dirs-only', 'b2-shop:Shop-Bucket'])
    // The key went into the file, never onto a command line.
    expect(JSON.stringify(ctx.system.calls)).not.toContain('K003shopsecret')
    expect(readFileSync(ctx.config.rcloneConfig, 'utf8')).toContain('K003shopsecret')
  })

  it('writes nothing when any part of the request is wrong', async () => {
    const ctx = siteWithDatabase()
    await expect(
      backupsFor(ctx.host).save(ctx.site, { storage: 'B2', folder: 'Backups', schedule: { every: 'daily', hour: 99, minute: 0, keepDays: 1 } })
    ).rejects.toThrow(/hour/)
    await expect(backupsFor(ctx.host).save(ctx.site, { storage: 'B2', folder: 'media/x' })).rejects.toThrow(/public/)
    await expect(backupsFor(ctx.host).save(ctx.site, { folder: 'Backups' })).rejects.toThrow(/"storage" is needed/)
    expect(existsSync(ctx.config.rcloneConfig)).toBe(false)
    expect(new Databases(ctx.config, ctx.system).destination('shop')).toBeNull()
  })

  it('refuses when the database is not on this server', async () => {
    const ctx = hostWithSite()
    expect(backupsFor(ctx.host).state(ctx.site).database).toBeNull()
    await expect(backupsFor(ctx.host).save(ctx.site, { storage: 'B2', folder: 'Backups' })).rejects.toThrow(/not on this server/)
    expect(() => backupsFor(ctx.host).runNow(ctx.site)).toThrow(/not on this server/)
  })

  it('backs up now, copies, tidies old copies, and records how it went', async () => {
    const ctx = siteWithDatabase()
    const runner = backupsFor(ctx.host)
    await runner.save(ctx.site, { storage: 'B2', folder: 'Backups', schedule: { every: 'off', hour: 3, minute: 30, keepDays: 10 } })
    expect(runner.runNow(ctx.site)).toBe(true)
    expect(runner.runNow(ctx.site)).toBe(false)
    expect(runner.state(ctx.site).running).toBe(true)
    await runner.whenIdle()
    const state = runner.state(ctx.site)
    expect(state.running).toBe(false)
    expect(state.lastRun).toMatchObject({ ok: true, copiedTo: 'b2-shop:Shop-Bucket/Backups', trigger: 'manual', error: null })
    const rclone = ctx.system.calls.filter((c) => c.cmd === 'rclone').map((c) => c.args[0])
    expect(rclone).toEqual(['lsf', 'copy', 'delete'])
    expect(ctx.system.calls.find((c) => c.cmd === 'rclone' && c.args[0] === 'delete')?.args).toEqual([
      'delete', '--include', 'shop-*.dump', '--min-age', '10d', 'b2-shop:Shop-Bucket/Backups',
    ])
  })

  it('records a failed run instead of throwing it at the scheduler', async () => {
    const ctx = siteWithDatabase()
    ctx.system.dumpExit = 1
    const runner = backupsFor(ctx.host)
    runner.runNow(ctx.site)
    await runner.whenIdle()
    expect(runner.state(ctx.site).lastRun).toMatchObject({ ok: false, error: expect.stringMatching(/Dumping shop failed/) })
  })

  it('queues a scheduled database when its slot comes round, once', async () => {
    const ctx = siteWithDatabase()
    const runner = backupsFor(ctx.host)
    new Databases(ctx.config, ctx.system).setSchedule('shop', { every: 'daily', hour: 3, minute: 30, keepDays: 30 })
    ctx.system.clock = at('2026-10-31T03:30:00Z')
    expect(runner.tick(new Date('2026-10-31T03:29:00Z'))).toEqual([])
    expect(runner.tick(new Date('2026-10-31T03:30:00Z'))).toEqual(['shop'])
    await runner.whenIdle()
    expect(runner.tick(new Date('2026-10-31T03:31:00Z'))).toEqual([])
    expect(runner.state(ctx.site).lastRun?.trigger).toBe('schedule')
  })
})

describe('the backup routes', () => {
  const servers: Array<{ close: () => void }> = []
  afterEach(() => {
    for (const s of servers.splice(0)) s.close()
  })

  it('lets a site read and change its own settings, and audits the change', async () => {
    const ctx = siteWithDatabase()
    const server = createApiServer(ctx.host)
    servers.push(server)
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/sites/shop`
    const headers = { Authorization: `Bearer ${TEST_TOKEN}`, 'Content-Type': 'application/json' }

    const before = (await (await fetch(`${base}/backup`, { headers })).json()) as { backup: SiteBackupState }
    expect(before.backup).toMatchObject({ database: 'shop', destination: null, schedule: { every: 'off' } })

    const put = await fetch(`${base}/backup`, { method: 'PUT', headers, body: JSON.stringify({ storage: 'B2', folder: 'Backups/shop' }) })
    expect(put.status).toBe(200)
    expect(((await put.json()) as { backup: SiteBackupState }).backup.destination).toBe('b2-shop:Shop-Bucket/Backups/shop')

    const bad = await fetch(`${base}/backup`, { method: 'PUT', headers, body: JSON.stringify({ storage: 'B2', folder: 'media' }) })
    expect(bad.status).toBe(400)

    const run = await fetch(`${base}/backup/run`, { method: 'POST', headers })
    expect(run.status).toBe(202)
    expect(((await run.json()) as { started: boolean }).started).toBe(true)
    await backupsFor(ctx.host).whenIdle()

    const audit = readFileSync(`${ctx.config.stateDir}/admin-audit.log`, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { actor: string; action: string; ok: boolean })
    expect(audit.map((a) => [a.actor, a.action, a.ok])).toEqual([
      ['site-api', 'backup.settings', true],
      ['site-api', 'backup.settings', false],
      ['site-api', 'backup.run', true],
    ])
    expect((await fetch(`${base}/backup`, { headers: { Authorization: 'Bearer chs_wrong' } })).status).toBe(401)
  })
})
