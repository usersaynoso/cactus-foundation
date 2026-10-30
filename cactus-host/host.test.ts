import { existsSync, readFileSync, readlinkSync } from 'node:fs'
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
    expect(readFileSync(ctx.paths.caddyFile, 'utf8')).toContain('reverse_proxy 127.0.0.1:3100')
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
    expect(readFileSync(ctx.paths.caddyFile, 'utf8')).toContain('reverse_proxy 127.0.0.1:3100')
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
    ctx.config.tls = { cert: '/etc/cactus-host/tls/default.pem', key: '/etc/cactus-host/tls/default.key' }
    await ctx.host.writeRouting(ctx.site)
    expect(readFileSync(ctx.paths.caddyFile, 'utf8')).toContain('tls /etc/cactus-host/tls/default.pem')
    await ctx.host.writeRouting({ ...ctx.site, tls: { cert: '/etc/cactus-host/tls/shop.pem', key: '/etc/cactus-host/tls/shop.key' } })
    const file = readFileSync(ctx.paths.caddyFile, 'utf8')
    expect(file).toContain('tls /etc/cactus-host/tls/shop.pem /etc/cactus-host/tls/shop.key')
    expect(file).not.toContain('default.pem')
  })

  it('refuses a certificate path that could smuggle in Caddy config', async () => {
    const ctx = hostWithSite()
    await expect(ctx.host.writeRouting({ ...ctx.site, tls: { cert: '/x.pem }\nimport /etc/passwd', key: '/x.key' } })).rejects.toThrow(/plain absolute path/)
  })
})
