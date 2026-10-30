import { existsSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseEnv } from './env-file.ts'
import { FAKE_SHA, hostWithSite } from './testing.ts'

async function build(ctx: ReturnType<typeof hostWithSite>, sha?: string) {
  const { build } = ctx.host.startBuild('shop', { sha })
  await ctx.host.waitForBuild(build.id)
  return ctx.host.store.getBuild('shop', build.id)!
}

const systemctl = (ctx: ReturnType<typeof hostWithSite>) =>
  ctx.system.calls
    .filter((c) => c.cmd === 'systemctl' && c.args.join(' ') !== 'reload caddy')
    .map((c) => c.args.filter((a) => a !== '--quiet').join(' '))

describe('a build', () => {
  it('fetches, builds, health-checks and goes live in slot a', async () => {
    const ctx = hostWithSite({ env: { DATABASE_URL: 'postgresql://localhost/shop' } })
    const b = await build(ctx)

    expect(b.state).toBe('ready')
    expect(b.live).toBe(true)
    expect(b.sha).toBe(FAKE_SHA)
    expect(b.slot).toBe('a')
    expect(ctx.host.store.getSite('shop')?.liveSlot).toBe('a')
    expect(readlinkSync(ctx.paths.slot('a'))).toBe(b.releaseDir)
    expect(systemctl(ctx)).toEqual(['restart cactus-shop-a.service', 'enable cactus-shop-a.service'])
    expect(readFileSync(ctx.paths.caddyFile, 'utf8')).toContain('reverse_proxy localhost:3100')
  })

  it('runs the steps as the site user under the build limits', async () => {
    const ctx = hostWithSite()
    await build(ctx)
    const steps = ctx.system.calls.filter((c) => c.cmd === 'systemd-run')
    expect(steps.map((s) => s.args.slice(s.args.indexOf('--') + 2).join(' '))).toEqual([
      'ci --include=dev --no-audit --no-fund',
      'run build',
    ])
    for (const s of steps) {
      expect(s.args).toContain('--uid=cactus-shop')
      expect(s.args).toContain('IOSchedulingClass=idle')
      expect(s.args).toContain('MemoryMax=6G')
    }
  })

  it('snapshots the env into the release, with the build it belongs to', async () => {
    const ctx = hostWithSite()
    const b = await build(ctx)
    const env = parseEnv(readFileSync(join(b.releaseDir!, '.cactus-env'), 'utf8'))
    expect(env.get('CACTUS_HOST_BUILD_ID')).toBe(b.id)
    expect(env.get('CACTUS_HOST_COMMIT_SHA')).toBe(FAKE_SHA)
    expect(env.get('SESSION_SECRET')).toBe('very-secret')
  })

  it('publishes static files to the shared directory', async () => {
    const ctx = hostWithSite()
    const b = await build(ctx)
    expect(existsSync(join(ctx.paths.static, '_next', 'static', 'chunks', `${b.id}.js`))).toBe(true)
  })

  it('switches the next build into slot b and stops slot a after the switch', async () => {
    const ctx = hostWithSite()
    const first = await build(ctx)
    ctx.system.calls.length = 0
    const second = await build(ctx)

    expect(second.slot).toBe('b')
    expect(ctx.host.store.getBuild('shop', first.id)?.live).toBe(false)
    expect(systemctl(ctx)).toEqual([
      'restart cactus-shop-b.service',
      'enable cactus-shop-b.service',
      'disable cactus-shop-a.service',
      'stop cactus-shop-a.service',
    ])
    const order = ctx.system.calls.map((c) => `${c.cmd} ${c.args[0]}`)
    expect(order.indexOf('systemctl reload')).toBeLessThan(order.indexOf('systemctl stop'))
  })

  it('leaves the old version serving when the new one fails its health check', async () => {
    const ctx = hostWithSite({ env: { DATABASE_URL: 'postgresql://localhost/shop' } })
    const first = await build(ctx)
    ctx.system.healthy = (port) => port !== 3101
    ctx.system.calls.length = 0
    const second = await build(ctx)

    expect(second.state).toBe('error')
    expect(second.error).toMatch(/did not start properly/)
    expect(second.releaseDir).toBeNull()
    expect(ctx.host.store.getSite('shop')?.liveSlot).toBe('a')
    expect(ctx.host.store.getBuild('shop', first.id)?.live).toBe(true)
    expect(readFileSync(ctx.paths.caddyFile, 'utf8')).toContain('reverse_proxy localhost:3100')
    expect(systemctl(ctx)).toEqual(['restart cactus-shop-b.service', 'stop cactus-shop-b.service'])
  })

  it('accepts a first build with no database yet, which cannot pass /api/health', async () => {
    const ctx = hostWithSite()
    ctx.system.healthy = () => false
    const b = await build(ctx)
    expect(b.state).toBe('ready')
  })

  it('reports a failed build step and keeps nothing of it', async () => {
    const ctx = hostWithSite()
    ctx.system.buildExit = (cmd) => (cmd.includes('build') ? 1 : 0)
    const b = await build(ctx)
    expect(b.state).toBe('error')
    expect(b.error).toMatch(/The build failed/)
    expect(ctx.host.store.getSite('shop')?.liveSlot).toBeNull()
  })

  it('refuses a commit that is not on the branch', async () => {
    const ctx = hostWithSite()
    const b = await build(ctx, 'deadbeef00')
    expect(b.state).toBe('error')
    expect(b.error).toMatch(/not on main/)
  })

  it('runs one build at a time and hands back the running one', async () => {
    const ctx = hostWithSite()
    const first = ctx.host.startBuild('shop')
    const second = ctx.host.startBuild('shop')
    expect(second.alreadyRunning).toBe(true)
    expect(second.build.id).toBe(first.build.id)
    await ctx.host.waitForAll()
  })

  it('keeps only the configured number of releases', async () => {
    const ctx = hostWithSite()
    const builds = []
    for (let i = 0; i < 5; i++) builds.push(await build(ctx))
    const kept = ctx.host.store.listBuilds('shop').filter((b) => b.releaseDir)
    expect(kept.map((b) => b.id)).toEqual(builds.slice(-3).reverse().map((b) => b.id))
    expect(existsSync(builds[0]!.releaseDir!)).toBe(false)
    // Static files of pruned releases go too; kept ones stay.
    const chunks = join(ctx.paths.static, '_next', 'static', 'chunks')
    expect(existsSync(join(chunks, `${builds[0]!.id}.js`))).toBe(false)
    expect(existsSync(join(chunks, `${builds[4]!.id}.js`))).toBe(true)
  })

  it('serves its log in whole lines, from where the reader left off', async () => {
    const ctx = hostWithSite()
    const b = await build(ctx)
    const all = ctx.host.readLog('shop', b.id, 0)
    expect(all.done).toBe(true)
    expect(all.lines).toContain('Live.')
    const rest = ctx.host.readLog('shop', b.id, all.next)
    expect(rest.lines).toEqual([])
  })
})

describe('rollback', () => {
  it('puts the previous release back live without building', async () => {
    const ctx = hostWithSite()
    const first = await build(ctx)
    await build(ctx)
    ctx.system.calls.length = 0
    const back = await ctx.host.rollback('shop')

    expect(back.id).toBe(first.id)
    expect(ctx.host.store.getBuild('shop', first.id)?.live).toBe(true)
    expect(ctx.host.store.getSite('shop')?.liveSlot).toBe('a')
    expect(ctx.system.calls.some((c) => c.cmd === 'systemd-run')).toBe(false)
  })

  it('says so when there is nothing to go back to', async () => {
    const ctx = hostWithSite()
    await build(ctx)
    await expect(ctx.host.rollback('shop')).rejects.toThrow(/no earlier version/)
  })
})

describe('database snapshots', () => {
  const withDb = () => hostWithSite({ env: { DATABASE_URL: 'postgresql://shop:pw@localhost:5432/shop' } })
  const sql = (ctx: ReturnType<typeof hostWithSite>) =>
    ctx.system.calls.filter((c) => c.cmd === 'runuser' && c.args.includes('psql')).map((c) => c.args[c.args.length - 1] as string)

  it('dumps the database after installing and before the build runs its migrations', async () => {
    const ctx = withDb()
    const b = await build(ctx)
    const order = ctx.system.calls
      .filter((c) => c.cmd === 'systemd-run' || (c.cmd === 'sh' && c.args[1]?.includes('pg_dump')))
      .map((c) => (c.cmd === 'sh' ? 'dump' : c.args.slice(c.args.indexOf('--') + 2).join(' ')))
    expect(order).toEqual(['ci --include=dev --no-audit --no-fund', 'dump', 'run build'])
    const [snap] = ctx.host.snapshots.list('shop')
    expect(snap).toMatchObject({ database: 'shop', reason: 'build', buildId: b.id })
    expect(existsSync(snap!.file)).toBe(true)
  })

  it('leaves a database on another server alone', async () => {
    const ctx = hostWithSite({ env: { DATABASE_URL: 'postgresql://u:p@ep-cool.neon.tech/neondb' } })
    expect((await build(ctx)).state).toBe('ready')
    expect(ctx.host.snapshots.list('shop')).toEqual([])
  })

  it('stops the build, with the old version still live, when the dump fails', async () => {
    const ctx = withDb()
    const first = await build(ctx)
    ctx.system.dumpExit = 1
    const second = await build(ctx)
    expect(second.state).toBe('error')
    expect(second.error).toMatch(/Dumping shop/)
    expect(ctx.host.store.getBuild('shop', first.id)?.live).toBe(true)
    expect(ctx.system.calls.filter((c) => c.cmd === 'systemd-run').length).toBe(3)
  })

  it('rolls back with the database as it was when that version was replaced', async () => {
    const ctx = withDb()
    const first = await build(ctx)
    const second = await build(ctx)
    const point = ctx.host.restorePoints('shop').get(first.id)
    expect(point).toMatchObject({ reason: 'build', buildId: second.id })

    ctx.system.calls.length = 0
    const back = await ctx.host.rollback('shop', first.id, { restoreDatabase: true })
    expect(back.id).toBe(first.id)

    // The database as it is now is saved first, then the restore point goes in beside
    // it and takes its name, and the replaced copy is dropped once the old code is up.
    const restore = ctx.system.calls.find((c) => c.cmd === 'sh' && c.args[1]?.includes('pg_restore'))
    expect(restore?.args.slice(3, 5)).toEqual(['shop__incoming', point!.file])
    expect(sql(ctx)).toEqual(expect.arrayContaining([
      'ALTER DATABASE shop RENAME TO shop__replaced',
      'ALTER DATABASE shop__incoming RENAME TO shop',
      'DROP DATABASE IF EXISTS shop__replaced WITH (FORCE)',
    ]))
    expect(ctx.host.snapshots.list('shop')[0]).toMatchObject({ reason: 'rollback', buildId: first.id })
    // ...and that copy is what going forward again would restore.
    expect(ctx.host.restorePoints('shop').get(second.id)).toMatchObject({ reason: 'rollback' })
  })

  it('swaps the database straight back if the old version will not start', async () => {
    const ctx = withDb()
    const first = await build(ctx)
    const second = await build(ctx)
    ctx.system.healthy = (port) => port !== ctx.site.ports.a
    ctx.system.calls.length = 0
    await expect(ctx.host.rollback('shop', first.id, { restoreDatabase: true })).rejects.toThrow(/did not start/)
    expect(sql(ctx)).toEqual(expect.arrayContaining([
      'ALTER DATABASE shop RENAME TO shop__incoming',
      'ALTER DATABASE shop__replaced RENAME TO shop',
      'DROP DATABASE IF EXISTS shop__incoming WITH (FORCE)',
    ]))
    expect(sql(ctx)).not.toContain('DROP DATABASE IF EXISTS shop__replaced WITH (FORCE)')
    expect(ctx.host.store.getBuild('shop', second.id)?.live).toBe(true)
  })

  it('offers no copy to a release when another build changed the database after it', async () => {
    const ctx = withDb()
    const first = await build(ctx)
    const second = await build(ctx)
    // As if the second had been built before snapshots existed: it took none, and
    // nobody knows what its migrations did.
    const record = ctx.host.store.getBuild('shop', second.id)!
    delete record.reachedMigrations
    ctx.host.store.saveBuild('shop', record)
    const index = join(ctx.config.stateDir, 'snapshots', 'shop', 'index.json')
    writeFileSync(index, JSON.stringify(ctx.host.snapshots.list('shop').filter((s) => s.buildId !== second.id)))
    const third = await build(ctx)
    expect(ctx.host.restorePoints('shop').get(second.id)).toMatchObject({ buildId: third.id })
    expect(ctx.host.restorePoints('shop').has(first.id)).toBe(false)
  })

  it('still offers a copy past a build that failed before reaching its migrations', async () => {
    const ctx = withDb()
    const first = await build(ctx)
    ctx.system.buildExit = (command) => (command.includes('ci') ? 1 : 0)
    expect((await build(ctx)).state).toBe('error')
    ctx.system.buildExit = () => 0
    const third = await build(ctx)
    expect(ctx.host.restorePoints('shop').get(first.id)).toMatchObject({ buildId: third.id })
  })

  it('refuses to restore a database it has no copy of, and leaves code-only rollback alone', async () => {
    const ctx = hostWithSite()
    const first = await build(ctx)
    await build(ctx)
    expect(ctx.host.restorePoints('shop').size).toBe(0)
    await expect(ctx.host.rollback('shop', first.id, { restoreDatabase: true })).rejects.toThrow(/only the code can go back/)
    expect((await ctx.host.rollback('shop', first.id)).id).toBe(first.id)
  })

  it('keeps the snapshots kept releases need and drops the rest', async () => {
    const ctx = withDb()
    for (let i = 0; i < 6; i++) await build(ctx)
    const snaps = ctx.host.snapshots.list('shop')
    expect(snaps.length).toBe(ctx.config.keepReleases)
    const kept = ctx.host.store.listBuilds('shop').filter((b) => b.releaseDir && !b.live)
    for (const b of kept) expect(ctx.host.restorePoints('shop').has(b.id)).toBe(true)
  })
})

describe('asking a site to update itself', () => {
  it('posts to the live release with the token it was built with', async () => {
    const ctx = hostWithSite()
    await build(ctx)
    const answer = { ok: true, upToDate: false, core: { from: '1.0.0', to: '1.1.0' }, updated: 2, failed: [], redeployTriggered: true }
    ctx.system.answer = (req) => (req.path === '/api/internal/host-update' ? { status: 200, body: JSON.stringify(answer) } : null)
    expect(await ctx.host.requestUpdate('shop')).toEqual(answer)
    const sent = ctx.system.requests.find((r) => r.path === '/api/internal/host-update')
    expect(sent).toMatchObject({ method: 'POST', port: ctx.site.ports.a })
    expect(sent?.headers.Authorization).toBe('Bearer chs_test-token')
    expect(sent?.headers.Host).toBe('shop.example.com')
  })

  it('says plainly when the site is too old to have the route', async () => {
    const ctx = hostWithSite()
    await build(ctx)
    ctx.system.answer = (req) => (req.path === '/api/internal/host-update' ? { status: 404, body: '<html>404</html>' } : null)
    await expect(ctx.host.requestUpdate('shop')).rejects.toThrow(/too old to be updated from here/)
  })

  it('passes on what the site said went wrong', async () => {
    const ctx = hostWithSite()
    await build(ctx)
    ctx.system.answer = (req) => (req.path === '/api/internal/host-update' ? { status: 409, body: JSON.stringify({ error: 'A deployment is already in progress' }) } : null)
    await expect(ctx.host.requestUpdate('shop')).rejects.toMatchObject({ status: 409, message: 'A deployment is already in progress' })
  })

  it('needs a live version to ask', async () => {
    const ctx = hostWithSite()
    await expect(ctx.host.requestUpdate('shop')).rejects.toThrow(/no live version/)
  })
})

describe('environment', () => {
  it('lists every key but never hands back a secret', () => {
    const { host } = hostWithSite()
    expect(host.listEnvKeys('shop').find((k) => k.key === 'SESSION_SECRET')).toEqual({ key: 'SESSION_SECRET', secret: true })
    expect(host.readEnvValues('shop', ['SESSION_SECRET', 'SITE_URL', 'NOPE'])).toEqual({
      SESSION_SECRET: null,
      SITE_URL: 'https://shop.example.com',
    })
  })

  it('writes, marks secrets, and refuses the keys it owns', () => {
    const { host } = hostWithSite()
    host.writeEnv('shop', [{ key: 'BREVO_API_KEY', value: 'k', secret: true }, { key: 'PLAIN', value: 'p', secret: false }])
    expect(host.readEnvValues('shop', ['BREVO_API_KEY', 'PLAIN'])).toEqual({ BREVO_API_KEY: null, PLAIN: 'p' })
    expect(() => host.writeEnv('shop', [{ key: 'CACTUS_HOST_TOKEN', value: 'x', secret: true }])).toThrow(/managed by cactus-host/)
    expect(() => host.writeEnv('shop', [{ key: 'bad key', value: 'x', secret: false }])).toThrow(/valid/)
  })

  it('deletes, but not what it owns', () => {
    const { host } = hostWithSite()
    expect(host.deleteEnv('shop', ['SITE_URL', 'CACTUS_HOSTING_PROVIDER', 'NOT_SET'])).toEqual({
      deleted: ['SITE_URL'],
      failed: [{ key: 'CACTUS_HOSTING_PROVIDER', error: 'managed by cactus-host' }],
    })
  })

  it('does not change a running release, only the next build', async () => {
    const ctx = hostWithSite()
    const b = await build(ctx)
    ctx.host.writeEnv('shop', [{ key: 'SITE_URL', value: 'https://new.example.com', secret: false }])
    expect(parseEnv(readFileSync(join(b.releaseDir!, '.cactus-env'), 'utf8')).get('SITE_URL')).toBe('https://shop.example.com')
  })
})

describe('domains', () => {
  it('adds a domain to the Caddy file and checks it by its proof value', async () => {
    const ctx = hostWithSite({ domains: [] })
    expect((await ctx.host.addDomain('shop', 'Shop.Example.com')).serving).toBe(false)
    expect(readFileSync(ctx.paths.caddyFile, 'utf8')).toContain('shop.example.com {')
    ctx.system.proofs.set('shop.example.com', 'proof-value')
    expect((await ctx.host.domainStatus('shop', 'shop.example.com')).serving).toBe(true)
    ctx.system.proofs.set('shop.example.com', 'somebody-else')
    expect((await ctx.host.domainStatus('shop', 'shop.example.com')).serving).toBe(false)
  })

  it('refuses a domain another site already has', async () => {
    const ctx = hostWithSite()
    ctx.host.store.saveSite({ ...ctx.site, id: 'blog', domains: ['blog.example.com'] })
    await expect(ctx.host.addDomain('shop', 'blog.example.com')).rejects.toThrow(/another site/)
  })
})

describe('primary and redirect domains', () => {
  it('serves the primary and redirects the rest to it, proof path included', async () => {
    const ctx = hostWithSite({ domains: [] })
    await ctx.host.addDomain('shop', 'shop.example.com')
    await ctx.host.addDomain('shop', 'www.shop.example.com')
    const file = readFileSync(ctx.paths.caddyFile, 'utf8')
    expect(file).toContain('www.shop.example.com {')
    expect(file).toContain('redir https://shop.example.com{uri} permanent')
    expect(file.match(/respond "proof-value" 200/g)).toHaveLength(2)
    expect(file).not.toMatch(/shop\.example\.com, www/)
  })

  it('makes another domain primary, and promotes one when the primary is removed', async () => {
    const ctx = hostWithSite({ domains: [] })
    await ctx.host.addDomain('shop', 'a.example.com')
    await ctx.host.addDomain('shop', 'b.example.com', { primary: true })
    expect(ctx.host.site('shop').domains).toEqual(['b.example.com', 'a.example.com'])
    await ctx.host.setPrimaryDomain('shop', 'a.example.com')
    expect(ctx.host.site('shop').domains).toEqual(['a.example.com', 'b.example.com'])
    await ctx.host.removeDomain('shop', 'a.example.com')
    expect(ctx.host.site('shop').domains).toEqual(['b.example.com'])
    await expect(ctx.host.removeDomain('shop', 'b.example.com')).rejects.toThrow(/only domain/)
    await expect(ctx.host.removeDomain('shop', 'zzz.example.com')).rejects.toThrow(/not attached/)
  })

  it('gives a domain in another zone its own certificate, in its own redirect block', async () => {
    const ctx = hostWithSite({ domains: [] })
    await ctx.host.addDomain('shop', 'shop.example.com')
    await ctx.host.addDomain('shop', 'www.shop.example.com')
    await ctx.host.addDomain('shop', 'shop.example.org', { tls: { cert: '/etc/caddy/tls/example.org.pem', key: '/etc/caddy/tls/example.org.key' } })
    const file = readFileSync(ctx.paths.caddyFile, 'utf8')
    expect(file).toContain('www.shop.example.com {')
    expect(file).toMatch(/shop\.example\.org \{\n\ttls \/etc\/caddy\/tls\/example\.org\.pem \/etc\/caddy\/tls\/example\.org\.key/)
    await ctx.host.removeDomain('shop', 'shop.example.org')
    expect(ctx.host.site('shop').domainTls).toEqual({})
    expect(readFileSync(ctx.paths.caddyFile, 'utf8')).not.toContain('example.org')
  })

  it('edits a site name and branch', async () => {
    const ctx = hostWithSite()
    expect((await ctx.host.editSite('shop', { name: ' The Shop ', branch: 'release' })).site).toMatchObject({ name: 'The Shop', branch: 'release' })
    await expect(ctx.host.editSite('shop', { branch: '--bad' })).rejects.toThrow(/branch/)
  })
})

describe('restart recovery', () => {
  it('marks a build that was running when the service stopped as failed', () => {
    const ctx = hostWithSite()
    ctx.host.store.saveBuild('shop', {
      id: 'x', sha: '', ref: 'main', state: 'building', createdAt: 1, finishedAt: null, error: null,
      live: false, trigger: 'api', releaseDir: null, slot: null,
    })
    ctx.host.recoverInterruptedBuilds()
    expect(ctx.host.store.getBuild('shop', 'x')?.state).toBe('error')
  })
})

describe('the Caddy file', () => {
  it('uses the site\'s own origin certificate over the server-wide one', async () => {
    const ctx = hostWithSite()
    ctx.config.tls = { cert: '/etc/caddy/tls/default.pem', key: '/etc/caddy/tls/default.key' }
    await ctx.host.writeRouting(ctx.site)
    expect(readFileSync(ctx.paths.caddyFile, 'utf8')).toContain('tls /etc/caddy/tls/default.pem')
    await ctx.host.writeRouting({ ...ctx.site, tls: { cert: '/etc/caddy/tls/shop.pem', key: '/etc/caddy/tls/shop.key' } })
    const file = readFileSync(ctx.paths.caddyFile, 'utf8')
    expect(file).toContain('tls /etc/caddy/tls/shop.pem /etc/caddy/tls/shop.key')
    expect(file).not.toContain('default.pem')
  })

  it('refuses a certificate path that could smuggle in Caddy config', async () => {
    const ctx = hostWithSite()
    await expect(ctx.host.writeRouting({ ...ctx.site, tls: { cert: '/x.pem }\nimport /etc/passwd', key: '/x.key' } })).rejects.toThrow(/plain absolute path/)
  })
})
