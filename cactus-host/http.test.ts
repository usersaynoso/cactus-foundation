import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { createApiServer } from './http.ts'
import { hashToken } from './tokens.ts'
import { hostWithSite, TEST_TOKEN } from './testing.ts'

const servers: Array<{ close: () => void }> = []
afterEach(() => {
  for (const s of servers.splice(0)) s.close()
})

async function api(ctx: ReturnType<typeof hostWithSite>) {
  const server = createApiServer(ctx.host)
  servers.push(server)
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
  return (path: string, init: { method?: string; body?: unknown; token?: string | null } = {}) =>
    fetch(`${base}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(init.token === null ? {} : { Authorization: `Bearer ${init.token ?? TEST_TOKEN}` }),
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
}

describe('the API', () => {
  it('answers health without a token, and nothing else', async () => {
    const call = await api(hostWithSite())
    expect((await call('/health', { token: null })).status).toBe(200)
    expect((await call('/sites/shop', { token: null })).status).toBe(401)
    expect((await call('/sites/shop', { token: 'chs_wrong' })).status).toBe(401)
  })

  it('never lets one site see another', async () => {
    const ctx = hostWithSite()
    ctx.host.store.saveSite({ ...ctx.site, id: 'blog', tokenHash: hashToken('chs_blog'), domains: ['blog.example.com'] })
    const call = await api(ctx)
    expect((await call('/sites/blog')).status).toBe(404)
    const listed = (await (await call('/sites')).json()) as { sites: Array<{ id: string }> }
    expect(listed.sites.map((s) => s.id)).toEqual(['shop'])
  })

  it('reads and writes env the way the app expects', async () => {
    const call = await api(hostWithSite())
    expect((await call('/sites/shop/env', { method: 'PUT', body: { vars: [{ key: 'A', value: '1', secret: false }] } })).status).toBe(200)
    const values = (await (await call('/sites/shop/env/values', { method: 'POST', body: { keys: ['A', 'SESSION_SECRET'] } })).json()) as {
      values: Record<string, string | null>
    }
    expect(values.values).toEqual({ A: '1', SESSION_SECRET: null })
    const refused = await call('/sites/shop/env', { method: 'PUT', body: { vars: [{ key: 'CACTUS_HOSTING_PROVIDER', value: 'vercel' }] } })
    expect(refused.status).toBe(400)
    expect(((await refused.json()) as { error: string }).error).toMatch(/managed by cactus-host/)
  })

  it('starts a build, adopts the running one, and reports it', async () => {
    const ctx = hostWithSite()
    let release = () => {}
    ctx.system.hold = new Promise<void>((r) => (release = r))
    const call = await api(ctx)
    const first = (await (await call('/sites/shop/builds', { method: 'POST', body: {} })).json()) as {
      build: { id: string }
      alreadyRunning: boolean
    }
    const second = (await (await call('/sites/shop/builds', { method: 'POST', body: {} })).json()) as {
      build: { id: string }
      alreadyRunning: boolean
    }
    expect(second).toMatchObject({ alreadyRunning: true, build: { id: first.build.id } })
    ctx.system.hold = null
    release()
    await ctx.host.waitForAll()
    const got = (await (await call(`/sites/shop/builds/${first.build.id}`)).json()) as { build: { state: string; live: boolean } }
    expect(got.build).toMatchObject({ state: 'ready', live: true })
    const log = (await (await call(`/sites/shop/builds/${first.build.id}/log?since=0`)).json()) as { lines: string[]; done: boolean }
    expect(log.done).toBe(true)
    expect(log.lines.length).toBeGreaterThan(3)
  })

  it('refuses a malformed body plainly', async () => {
    const call = await api(hostWithSite())
    const res = await call('/sites/shop/env/values', { method: 'POST', body: { keys: 'SITE_URL' } })
    expect(res.status).toBe(400)
  })
})
