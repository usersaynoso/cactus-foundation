import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ADMIN_TOKEN_KEY, grantAdmin, readAdmin, revokeAdmin } from './admin.ts'
import { readAudit } from './audit.ts'
import { addSiteDomain, createSite } from './create.ts'
import { parseEnv } from './env-file.ts'
import { createApiServer } from './http.ts'
import { hostWithSite, TEST_TOKEN, withCluster } from './testing.ts'

const servers: Array<{ close: () => void }> = []
afterEach(() => {
  for (const s of servers.splice(0)) s.close()
})

function adminTokenOf(ctx: ReturnType<typeof hostWithSite>, siteId = 'shop'): string {
  const env = parseEnv(readFileSync(ctx.host.store.paths(siteId).env, 'utf8'))
  return env.get(ADMIN_TOKEN_KEY) as string
}

async function api(ctx: ReturnType<typeof hostWithSite>) {
  const server = createApiServer(ctx.host)
  servers.push(server)
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
  return (path: string, token: string | null, init: { method?: string; body?: unknown } = {}) =>
    fetch(`${base}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
}

describe('the admin token', () => {
  it('goes into the site env as a secret, and only its hash is kept', () => {
    const ctx = hostWithSite()
    const record = grantAdmin(ctx.host, 'shop')
    const token = adminTokenOf(ctx)
    expect(token).toMatch(/^cha_/)
    expect(record.site).toBe('shop')
    expect(readFileSync(join(ctx.config.stateDir, 'admin.json'), 'utf8')).not.toContain(token)
    expect(ctx.host.site('shop').secretKeys).toContain(ADMIN_TOKEN_KEY)
    expect(ctx.host.readEnvValues('shop', [ADMIN_TOKEN_KEY])).toEqual({ [ADMIN_TOKEN_KEY]: null })
  })

  it('cannot be set or removed through a site\'s own API', () => {
    const ctx = hostWithSite()
    grantAdmin(ctx.host, 'shop')
    expect(() => ctx.host.writeEnv('shop', [{ key: ADMIN_TOKEN_KEY, value: 'cha_mine', secret: true }])).toThrow(/managed by cactus-host/)
    expect(ctx.host.deleteEnv('shop', [ADMIN_TOKEN_KEY]).deleted).toEqual([])
  })

  it('moves with a new grant, and the old holder loses it', () => {
    const ctx = hostWithSite()
    ctx.host.store.saveSite({ ...ctx.site, id: 'ops', user: 'cactus-ops', domains: ['ops.example.com'] })
    mkdirSync(ctx.host.store.paths('ops').root, { recursive: true })
    writeFileSync(ctx.host.store.paths('ops').env, '')
    grantAdmin(ctx.host, 'shop')
    grantAdmin(ctx.host, 'ops')
    expect(adminTokenOf(ctx, 'shop')).toBeUndefined()
    expect(adminTokenOf(ctx, 'ops')).toMatch(/^cha_/)
    expect(readAdmin(ctx.config)?.site).toBe('ops')
    revokeAdmin(ctx.host)
    expect(adminTokenOf(ctx, 'ops')).toBeUndefined()
    expect(existsSync(join(ctx.config.stateDir, 'admin.json'))).toBe(false)
  })
})

describe('the admin API: editing a site', () => {
  it('adds, promotes and removes domains, and edits the name, only for the admin token', async () => {
    const ctx = hostWithSite()
    grantAdmin(ctx.host, 'shop')
    const admin = adminTokenOf(ctx)
    const call = await api(ctx)
    expect((await call('/admin/sites/shop/domains', TEST_TOKEN, { method: 'POST', body: { name: 'www.example.com' } })).status).toBe(401)
    const added = await call('/admin/sites/shop/domains', admin, { method: 'POST', body: { name: 'www.example.com' } })
    expect(added.status).toBe(201)
    expect(ctx.host.site('shop').domains).toEqual(['shop.example.com', 'www.example.com'])
    expect((await call('/admin/sites/shop/domains/www.example.com', admin, { method: 'PUT', body: { primary: true } })).status).toBe(200)
    expect(ctx.host.site('shop').domains[0]).toBe('www.example.com')
    expect((await call('/admin/sites/shop/domains/www.example.com', admin, { method: 'DELETE' })).status).toBe(200)
    expect((await call('/admin/sites/shop/domains/shop.example.com', admin, { method: 'DELETE' })).status).toBe(409)
    expect((await call('/admin/sites/shop/refresh', admin, { method: 'POST' })).status).toBe(200)
    const edited = await call('/admin/sites/shop', admin, { method: 'PATCH', body: { name: 'Renamed' } })
    expect((await edited.json() as { site: { name: string } }).site.name).toBe('Renamed')
    expect(readAudit(ctx.config, 20).map((e) => e.action)).toEqual(expect.arrayContaining(['site.domain.add', 'site.domain.primary', 'site.domain.remove', 'site.edit', 'site.refresh']))
  })
})

describe('adding a domain in another zone', () => {
  it('uses that zone\'s certificate from tlsDir, and none when the site\'s own covers it', async () => {
    const ctx = hostWithSite()
    ;(ctx.config as { tlsDir: string }).tlsDir = join(ctx.config.stateDir, 'tls')
    mkdirSync(ctx.config.tlsDir, { recursive: true })
    writeFileSync(join(ctx.config.tlsDir, 'other.furniture.pem'), 'c')
    writeFileSync(join(ctx.config.tlsDir, 'other.furniture.key'), 'k')
    const added = await addSiteDomain(ctx.host, 'shop', 'other.furniture', false)
    expect(added.cloudflare.manual.join(' ')).not.toMatch(/origin certificate for/)
    expect(ctx.host.site('shop').domainTls?.['other.furniture']).toEqual({
      cert: join(ctx.config.tlsDir, 'other.furniture.pem'),
      key: join(ctx.config.tlsDir, 'other.furniture.key'),
    })
    const bare = await addSiteDomain(ctx.host, 'shop', 'www.nocert.example', false)
    expect(bare.cloudflare.manual.join(' ')).toMatch(/origin certificate for www\.nocert\.example/)
    expect(ctx.host.site('shop').domainTls?.['www.nocert.example']).toBeUndefined()
  })
})

describe('the admin API', () => {
  it('answers the admin token only, and the admin token opens no site route', async () => {
    const ctx = hostWithSite()
    grantAdmin(ctx.host, 'shop')
    const admin = adminTokenOf(ctx)
    const call = await api(ctx)
    expect((await call('/admin/sites', null)).status).toBe(401)
    expect((await call('/admin/sites', TEST_TOKEN)).status).toBe(401)
    expect((await call('/sites/shop', admin)).status).toBe(401)
    const res = await call('/admin/sites', admin)
    expect(res.status).toBe(200)
    const { sites } = (await res.json()) as { sites: Array<{ id: string; ports: { a: number } }> }
    expect(sites.map((s) => [s.id, s.ports.a])).toEqual([['shop', 3100]])
  })

  it('refuses everybody once revoked', async () => {
    const ctx = hostWithSite()
    grantAdmin(ctx.host, 'shop')
    const admin = adminTokenOf(ctx)
    revokeAdmin(ctx.host)
    const call = await api(ctx)
    expect((await call('/admin/sites', admin)).status).toBe(401)
  })

  it('makes a database, hands the connection string back once, and audits it without the secret', async () => {
    const ctx = hostWithSite()
    withCluster(ctx.system)
    grantAdmin(ctx.host, 'shop')
    const call = await api(ctx)
    const res = await call('/admin/databases', adminTokenOf(ctx), { method: 'POST', body: { name: 'blog', backup: 'b2-blog:Blog/Backups' } })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { connectionString: string; database: { name: string } }
    expect(body.database.name).toBe('blog')
    const audit = readAudit(ctx.config, 10)
    expect(audit[0]).toMatchObject({ actor: 'admin-api', action: 'db.create', target: 'blog', ok: true })
    expect(readFileSync(join(ctx.config.stateDir, 'admin-audit.log'), 'utf8')).not.toContain(body.connectionString.split(':')[2]?.split('@')[0])

    const again = await call('/admin/databases', adminTokenOf(ctx), { method: 'POST', body: { name: 'blog' } })
    expect(again.status).toBe(400)
    expect(readAudit(ctx.config, 1)[0]).toMatchObject({ action: 'db.create', ok: false })
  })

  it('starts a build for any site', async () => {
    const ctx = hostWithSite()
    grantAdmin(ctx.host, 'shop')
    const call = await api(ctx)
    const res = await call('/admin/sites/shop/builds', adminTokenOf(ctx), { method: 'POST' })
    expect(res.status).toBe(202)
    await ctx.host.waitForAll()
    expect(readAudit(ctx.config, 1)[0]).toMatchObject({ action: 'site.build', target: 'shop', ok: true })
    expect((await call('/admin/sites/nope/builds', adminTokenOf(ctx), { method: 'POST' })).status).toBe(404)
  })
})

describe('site create', () => {
  it('gives the new site its database before the first build, and says what is left for Cloudflare', async () => {
    const ctx = hostWithSite()
    withCluster(ctx.system)
    const created = await createSite(ctx.host, {
      id: 'new-blog',
      repo: 'example/blog-site',
      domains: ['Blog.Example.org'],
      backup: 'b2-blog:Blog/Backups',
    })
    expect(created.database).toBe('new_blog')
    expect(created.site.domains).toEqual(['blog.example.org'])
    expect(created.cloudflare.manual).toHaveLength(3)
    const env = parseEnv(readFileSync(ctx.host.store.paths('new-blog').env, 'utf8'))
    expect(env.get('DATABASE_URL')).toMatch(/^postgresql:\/\/new_blog:[0-9a-f]{48}@localhost:5432\/new_blog\?/)
    expect(env.get('DIRECT_URL')).toBe(env.get('DATABASE_URL'))
    expect(env.get('SITE_URL')).toBe('https://blog.example.org')
    expect(ctx.host.site('new-blog').secretKeys).toEqual(expect.arrayContaining(['DATABASE_URL', 'DIRECT_URL', 'CACTUS_HOST_TOKEN']))
  })

  it('refuses before touching anything when the site or a domain is taken', async () => {
    const ctx = hostWithSite()
    withCluster(ctx.system)
    await expect(createSite(ctx.host, { id: 'shop', repo: 'a/b', domains: ['x.example.com'] })).rejects.toThrow(/already a site called shop/)
    await expect(createSite(ctx.host, { id: 'other', repo: 'a/b', domains: ['shop.example.com'] })).rejects.toThrow(/belongs to another site/)
    await expect(createSite(ctx.host, { id: 'other', repo: 'a/b', domains: [] })).rejects.toThrow(/at least one domain/)
    expect(ctx.system.calls.some((c) => c.cmd === 'runuser')).toBe(false)
  })

  it('says what already happened when a later step fails', async () => {
    const ctx = hostWithSite()
    withCluster(ctx.system)
    await expect(createSite(ctx.host, { id: 'other', repo: 'not a repo', domains: ['other.example.com'] })).rejects.toThrow(
      /Adding the site failed: --repo must be owner\/repo.*Already done: database other/
    )
  })

  it('does the Cloudflare steps with a scoped token, and refuses a record pointing elsewhere', async () => {
    const ctx = hostWithSite()
    withCluster(ctx.system)
    const tokenFile = join(ctx.config.stateDir, 'cf-token')
    writeFileSync(tokenFile, 'scoped-token\n')
    const config = { ...ctx.config, publicAddress: '203.0.113.7', cloudflare: { apiTokenFile: tokenFile }, tlsDir: join(ctx.config.stateDir, 'tls') }
    Object.assign(ctx.host, { config })
    const seen: Array<{ method: string; path: string; auth: string }> = []
    let elsewhere = false
    ctx.system.fetch = async (url: string, init?: RequestInit) => {
      const u = new URL(url)
      const method = init?.method ?? 'GET'
      seen.push({ method, path: u.pathname + u.search, auth: String((init?.headers as Record<string, string>).Authorization) })
      const ok = (result: unknown) => new Response(JSON.stringify({ success: true, result }), { status: 200 })
      if (u.pathname === '/client/v4/zones') return ok(u.searchParams.get('name') === 'example.org' ? [{ id: 'z1', name: 'example.org' }] : [])
      if (u.pathname.endsWith('/dns_records') && method === 'GET') return ok(elsewhere ? [{ id: 'r1', type: 'A', content: '198.51.100.1', proxied: true }] : [])
      if (u.pathname.endsWith('/settings/ssl') && method === 'GET') return ok({ value: 'full' })
      return ok({})
    }
    elsewhere = true
    await expect(createSite(ctx.host, { id: 'cf-one', repo: 'a/b', domains: ['www.example.org'] })).rejects.toThrow(/already has a A record pointing at 198\.51\.100\.1.*Already done: database cf_one/)
    elsewhere = false
    seen.length = 0
    // The certificate step needs real openssl; stop just before it by giving it a half pair.
    mkdirSync(config.tlsDir, { recursive: true })
    writeFileSync(join(config.tlsDir, 'example.org.key'), 'key')
    await expect(createSite(ctx.host, { id: 'cf-two', repo: 'a/b', domains: ['app.example.org'] })).rejects.toThrow(/Only half of example\.org's certificate/)
    expect(seen.every((s) => s.auth === 'Bearer scoped-token')).toBe(true)
    expect(seen.map((s) => `${s.method} ${s.path.split('?')[0]}`)).toEqual([
      'GET /client/v4/zones',
      'GET /client/v4/zones',
      'GET /client/v4/zones',
      'GET /client/v4/zones',
      'GET /client/v4/zones/z1/dns_records',
      'POST /client/v4/zones/z1/dns_records',
      'GET /client/v4/zones/z1/settings/ssl',
      'PATCH /client/v4/zones/z1/settings/ssl',
    ])
  })
})

describe('the admin API: deployments, settings and certificates', () => {
  it('lists builds with timing and whether each is kept, rolls back, and edits the backup destination', async () => {
    const ctx = hostWithSite({ env: { DATABASE_URL: 'postgresql://shop:pw@localhost:5432/shop' } })
    grantAdmin(ctx.host, 'shop')
    const admin = adminTokenOf(ctx)
    const call = await api(ctx)
    const first = ctx.host.startBuild('shop')
    await ctx.host.waitForBuild(first.build.id)
    const second = ctx.host.startBuild('shop')
    await ctx.host.waitForBuild(second.build.id)

    const listed = (await (await call('/admin/sites/shop/builds', admin)).json()) as { builds: Array<{ id: string; kept: boolean; startedAt: number }> }
    expect(listed.builds.map((b) => b.kept)).toEqual([true, true])
    expect(listed.builds[0]?.startedAt).toBeGreaterThan(0)

    const rolled = await call('/admin/sites/shop/rollback', admin, { method: 'POST', body: { buildId: first.build.id } })
    expect(rolled.status).toBe(200)
    expect(ctx.host.store.listBuilds('shop').find((b) => b.live)?.id).toBe(first.build.id)
    expect((await call('/admin/sites/shop/rollback', admin, { method: 'POST', body: { buildId: first.build.id } })).status).toBe(409)

    const edited = await call('/admin/sites/shop', admin, { method: 'PATCH', body: { backup: 'b2:Bucket/Shop' } })
    expect(((await edited.json()) as { site: { backup: string } }).site.backup).toBe('b2:Bucket/Shop')
    expect((await call('/admin/sites/shop', admin, { method: 'PATCH', body: { backup: 'not a remote' } })).status).toBe(400)

    const certs = (await (await call('/admin/sites/shop/certificates', admin)).json()) as { certificates: Array<{ domain: string }> }
    expect(certs.certificates.map((c) => c.domain)).toEqual(['shop.example.com'])
    expect((await call('/admin/sites/shop/domains/shop.example.com/certificate', admin, { method: 'POST' })).status).toBe(400)
    expect((await call('/admin/sites/shop/deploy-key', admin)).status).toBe(200)
    expect(readAudit(ctx.config, 20).map((e) => e.action)).toEqual(expect.arrayContaining(['site.rollback', 'site.edit', 'site.certificate']))
  })
})
