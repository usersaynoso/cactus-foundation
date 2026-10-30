import { existsSync, mkdirSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { grantAdmin, readAdmin } from './admin.ts'
import { adminSummary } from './create.ts'
import { Databases } from './db.ts'
import { parseEnv } from './env-file.ts'
import { renameSite } from './rename.ts'
import { hostWithSite, withCluster } from './testing.ts'

async function built(ctx: ReturnType<typeof hostWithSite>) {
  const { build } = ctx.host.startBuild('shop')
  await ctx.host.waitForBuild(build.id)
  return ctx.host.store.getBuild('shop', build.id)
}

describe('renaming a site', () => {
  it('moves everything to the new name and starts the live release again', async () => {
    const ctx = hostWithSite({ env: { DATABASE_URL: 'postgresql://shop:pw@localhost:5432/shop' } })
    const build = await built(ctx)
    expect(build?.state).toBe('ready')
    mkdirSync(ctx.config.keysDir, { recursive: true })
    writeFileSync(`${ctx.paths.deployKey}.pub`, 'ssh-ed25519 AAAA key')
    writeFileSync(ctx.paths.deployKey, 'private')
    grantAdmin(ctx.host, 'shop')
    ctx.system.calls.length = 0
    // Until usermod has run, the new user does not exist.
    const lookup = ctx.system.lookupUser
    let renamedUser = false
    ctx.system.lookupUser = (name) => (name === 'cactus-store' && !renamedUser ? null : lookup(name))
    const run = ctx.system.run.bind(ctx.system)
    ctx.system.run = async (cmd, args, opts) => {
      if (cmd === 'usermod') renamedUser = true
      return run(cmd, args, opts)
    }

    const renamed = await renameSite(ctx.host, 'shop', 'store')
    const after = ctx.host.store.paths('store')
    expect(renamed).toMatchObject({ id: 'store', user: 'cactus-store', liveSlot: 'a' })
    expect(ctx.host.store.getSite('shop')).toBeNull()
    expect(existsSync(ctx.paths.root)).toBe(false)
    expect(existsSync(ctx.paths.caddyFile)).toBe(false)
    expect(readFileSync(after.caddyFile, 'utf8')).toContain(after.static)
    expect(existsSync(after.deployKey) && existsSync(`${after.deployKey}.pub`)).toBe(true)
    expect(readlinkSync(after.slot('a'))).toBe(after.release(build?.id as string))
    expect(ctx.host.store.listBuilds('store')[0]?.releaseDir).toBe(after.release(build?.id as string))
    expect(parseEnv(readFileSync(after.env, 'utf8')).get('CACTUS_HOST_SITE_ID')).toBe('store')
    expect(parseEnv(readFileSync(join(after.release(build?.id as string), '.cactus-env'), 'utf8')).get('CACTUS_HOST_SITE_ID')).toBe('store')
    expect(readFileSync(after.unitFile('a'), 'utf8')).toContain(`WorkingDirectory=${after.slot('a')}`)
    expect(readAdmin(ctx.config)?.site).toBe('store')

    const cmds = ctx.system.calls.map((c) => `${c.cmd} ${c.args.join(' ')}`)
    expect(cmds).toEqual(expect.arrayContaining([
      'systemctl disable --now --quiet cactus-shop-a.service',
      'usermod --login cactus-store --home ' + after.home + ' cactus-shop',
      'groupmod --new-name cactus-store cactus-shop',
      'systemctl enable --now --quiet cactus-store-a.service',
    ]))
    // The database keeps its name and is still found.
    expect(adminSummary(ctx.host, renamed).database).toBe('shop')
  })

  it('refuses a taken, invalid or unchanged name, and a site that is building', async () => {
    const ctx = hostWithSite()
    ctx.host.store.saveSite({ ...ctx.site, id: 'taken', user: 'cactus-taken', domains: ['t.example.com'] })
    await expect(renameSite(ctx.host, 'shop', 'taken')).rejects.toThrow(/already a site/)
    await expect(renameSite(ctx.host, 'shop', 'Bad Name')).rejects.toThrow(/lower-case/)
    await expect(renameSite(ctx.host, 'shop', 'shop')).rejects.toThrow(/already called/)
    let release = () => {}
    ctx.system.hold = new Promise<void>((r) => { release = r })
    const { build } = ctx.host.startBuild('shop')
    await expect(renameSite(ctx.host, 'shop', 'store')).rejects.toThrow(/building|busy/)
    release()
    await ctx.host.waitForBuild(build.id)
  })
})

describe('editing a site', () => {
  it('moves to a new repo with a new deploy key and a fresh mirror', async () => {
    const ctx = hostWithSite({ env: { GITHUB_REPO: 'example/shop-site' } })
    withCluster(ctx.system)
    await built(ctx)
    expect(existsSync(ctx.paths.mirror)).toBe(true)
    const { site, deployKeyPublic } = await ctx.host.editSite('shop', { repo: 'example/new-site' })
    expect(site.repo).toBe('example/new-site')
    expect(deployKeyPublic).toMatch(/^ssh-ed25519/)
    expect(existsSync(ctx.paths.mirror)).toBe(false)
    expect(parseEnv(readFileSync(ctx.paths.env, 'utf8')).get('GITHUB_REPO')).toBe('example/new-site')
    await expect(ctx.host.editSite('shop', { repo: 'not a repo' })).rejects.toThrow(/owner\/repo/)
  })

  it('finds the site\'s database from DATABASE_URL, with its backup destination', () => {
    const ctx = hostWithSite({ env: { DATABASE_URL: 'postgresql://neondb_owner:pw@localhost:5432/neondb?x=1' } })
    new Databases(ctx.config, ctx.system).setDestination('neondb', 'b2:Bucket/Backups')
    expect(adminSummary(ctx.host, ctx.host.site('shop'))).toMatchObject({ database: 'neondb', backup: 'b2:Bucket/Backups' })
  })

  it('records when each build started, apart from when it was queued', async () => {
    const ctx = hostWithSite()
    const build = await built(ctx)
    expect(build?.startedAt).toBeGreaterThan(build?.createdAt as number)
    expect(build?.finishedAt).toBeGreaterThan(build?.startedAt as number)
  })
})
