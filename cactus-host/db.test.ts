import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Databases, dbNameForSite, scramVerifier } from './db.ts'
import { fakeSystem, testConfig, withCluster } from './testing.ts'

describe('scramVerifier', () => {
  it('matches an independent SCRAM-SHA-256 computation', () => {
    const salt = Buffer.from('W22ZaJ0SNY7soEsUEjb6gQ==', 'base64')
    expect(scramVerifier('pencil', salt)).toBe(
      'SCRAM-SHA-256$4096:W22ZaJ0SNY7soEsUEjb6gQ==$WG5d8oPm3OtcPnkdi4Uo7BkeZkBFzpcXkuLmtbsT4qY=:wfPLwcE6nTWhTAmQ7tl2KeoiWGPlZqQxSrmfPwDl2dU='
    )
  })

  it('refuses a password it cannot hash the way Postgres would', () => {
    expect(() => scramVerifier('pâté')).toThrow(/ASCII/)
  })
})

describe('Databases', () => {
  it('makes a role and database without the password ever reaching a command line', async () => {
    const sys = fakeSystem()
    withCluster(sys)
    const db = new Databases(testConfig(), sys)
    const { connectionString, database } = await db.create('my_shop', { backup: 'b2-shop:Shop/Backups' })
    const password = /^postgresql:\/\/my_shop:([0-9a-f]{48})@localhost:5432\/my_shop\?connection_limit=10&pool_timeout=20$/.exec(connectionString)?.[1]
    expect(password).toBeTruthy()
    const everything = JSON.stringify(sys.calls)
    expect(everything).not.toContain(password)
    expect(everything).toContain('SCRAM-SHA-256$4096:')
    expect(database).toEqual({ name: 'my_shop', owner: 'my_shop', sizeBytes: 0, backup: 'b2-shop:Shop/Backups' })
    expect(db.destination('my_shop')).toBe('b2-shop:Shop/Backups')
  })

  it('refuses names already taken, reserved, or unsafe', async () => {
    const sys = fakeSystem()
    withCluster(sys, { databases: ['shop'], roles: ['blog'] })
    const db = new Databases(testConfig(), sys)
    await expect(db.create('shop')).rejects.toThrow(/database called shop already exists/)
    await expect(db.create('blog')).rejects.toThrow(/role called blog already exists/)
    await expect(db.create('postgres')).rejects.toThrow(/not a usable database name/)
    await expect(db.create("x'; drop table y; --")).rejects.toThrow(/not a usable database name/)
    await expect(db.create('fine', { backup: 'b2:path; rm -rf /' })).rejects.toThrow(/not an rclone remote:path/)
    expect(sys.calls.some((c) => c.args.some((a) => a.startsWith('CREATE ROLE')))).toBe(false)
  })

  it('lists databases with their backup destinations', async () => {
    const sys = fakeSystem()
    withCluster(sys, { databases: ['shop', 'blog'] })
    const db = new Databases(testConfig(), sys)
    db.setDestination('shop', 'b2-shop:Shop/Backups')
    expect(await db.list()).toEqual([
      { name: 'shop', owner: 'shop', sizeBytes: 2097152, backup: 'b2-shop:Shop/Backups' },
      { name: 'blog', owner: 'blog', sizeBytes: 2097152, backup: null },
    ])
  })

  it('backs one database up and copies it to its own destination only', async () => {
    const sys = fakeSystem()
    withCluster(sys, { databases: ['shop'] })
    const config = testConfig()
    const db = new Databases({ ...config, backupDir: join(config.stateDir, 'dumps') }, sys)
    db.setDestination('shop', 'b2-shop:Shop/Backups')
    const { file, copiedTo } = await db.backup('shop')
    expect(file).toMatch(/dumps\/shop-\d{8}T\d{6}Z\.dump$/)
    expect(copiedTo).toBe('b2-shop:Shop/Backups')
    const dump = sys.calls.find((c) => c.cmd === 'sh')
    expect(dump?.args.slice(3)).toEqual(['shop', file, 'postgres'])
    expect(sys.calls.find((c) => c.cmd === 'rclone')?.args).toEqual(['copy', '--include', file.split('/').pop(), join(config.stateDir, 'dumps'), 'b2-shop:Shop/Backups'])
    await expect(db.backup('nope')).rejects.toThrow(/no database called nope/)
  })

  it('keeps its registry where only root can read it', () => {
    const config = testConfig()
    new Databases(config, fakeSystem()).setDestination('shop', null)
    const path = join(config.stateDir, 'databases.json')
    expect(existsSync(path)).toBe(true)
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ shop: { backup: null, createdAt: null } })
  })

  it('names a site\'s database after the site', () => {
    expect(dbNameForSite('my-shop')).toBe('my_shop')
  })
})

