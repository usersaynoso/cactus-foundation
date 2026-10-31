import { mkdtempSync, readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ADMIN_TOKEN_KEY, grantAdmin } from './admin.ts'
import { readAudit } from './audit.ts'
import { parseEnv } from './env-file.ts'
import { createApiServer } from './http.ts'
import { insertEvent } from './monitor-events.ts'
import { newMetricsToken } from './monitor-api.ts'
import type { Proc } from './monitor-proc.ts'
import { DEFAULT_SETTINGS } from './monitor-settings.ts'
import { Monitor } from './monitor.ts'
import { hostWithSite, TEST_TOKEN } from './testing.ts'

const servers: Array<{ close: () => void }> = []
afterEach(() => {
  for (const s of servers.splice(0)) s.close()
})

function proc(files: Record<string, string>): Proc {
  return {
    read: (p) => files[p] ?? null,
    list: (dir) => [...new Set(Object.keys(files).filter((k) => k.startsWith(`${dir}/`)).map((k) => k.slice(dir.length + 1).split('/')[0] as string))],
    statfs: (p) => (p === '/' ? { totalBytes: 100e9, availBytes: 40e9, freeBytes: 45e9, files: 1000, filesFree: 900 } : null),
    link: () => null,
  }
}

async function setup() {
  const ctx = hostWithSite()
  grantAdmin(ctx.host, 'shop')
  const token = parseEnv(readFileSync(ctx.host.store.paths('shop').env, 'utf8')).get(ADMIN_TOKEN_KEY) as string
  const files: Record<string, string> = {
    '/proc/stat': 'cpu  100 0 100 800 0 0 0 0\ncpu0 100 0 100 800 0 0 0 0\n',
    '/proc/meminfo': 'MemTotal: 1000 kB\nMemAvailable: 500 kB\n',
    '/proc/mounts': '/dev/md0 / ext4 rw 0 0\n',
    '/proc/uptime': '100.0 50.0',
  }
  const monitor = new Monitor(ctx.host, { proc: proc(files), cgroupRoot: '/cg', accessLogDir: mkdtempSync(join(tmpdir(), 'logs-')) })
  await monitor.tick(DEFAULT_SETTINGS)
  const server = createApiServer(ctx.host)
  servers.push(server)
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
  const call = (path: string, init: { method?: string; body?: unknown; token?: string | null } = {}) =>
    fetch(`${base}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(init.token !== null ? { Authorization: `Bearer ${init.token ?? token}` } : {}),
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
  return { ctx, monitor, call }
}

describe('the monitoring API', () => {
  it('answers only the admin token', async () => {
    const { call } = await setup()
    expect((await call('/admin/monitor/live', { token: null })).status).toBe(401)
    expect((await call('/admin/monitor/live', { token: TEST_TOKEN })).status).toBe(401)
    expect((await call('/admin/monitor/live')).status).toBe(200)
  })

  it('serves the live sample, history, the catalogue and events', async () => {
    const { call, monitor, ctx } = await setup()
    const live = (await (await call('/admin/monitor/live')).json()) as { live: { server: { mem: { totalBytes: number } } }; stale: boolean }
    expect(live.live.server.mem.totalBytes).toBe(1_024_000)
    const now = ctx.host.system.now()
    const q = (await (await call(`/admin/monitor/query?keys=mem.used_pct&name=disk.used_pct&from=${now - 3_600_000}&to=${now + 1000}`)).json()) as { series: { key: string; avg: (number | null)[] }[] }
    expect(q.series.map((s) => s.key).sort()).toEqual(['disk.used_pct@/', 'mem.used_pct'])
    expect(q.series.find((s) => s.key === 'mem.used_pct')?.avg.some((v) => v === 50)).toBe(true)
    expect((await call('/admin/monitor/query')).status).toBe(400)
    const cat = (await (await call('/admin/monitor/catalogue')).json()) as { sites: { id: string }[] }
    expect(cat.sites.map((s) => s.id)).toEqual(['shop'])
    insertEvent(monitor.store.db, { at: now, kind: 'build.ok', severity: 'info', site: 'shop', title: 'deployed', detail: null })
    const ev = (await (await call(`/admin/monitor/events?site=shop&from=${now - 1000}&to=${now + 1000}`)).json()) as { events: { title: string }[] }
    expect(ev.events.map((e) => e.title)).toEqual(['deployed'])
    expect((await call('/admin/monitor/events?site=nope')).status).toBe(404)
  })

  it('saves settings, records it in the audit log, and cleans what it is given', async () => {
    const { call, ctx } = await setup()
    const res = await call('/admin/monitor/settings', { method: 'PUT', body: { settings: { ...DEFAULT_SETTINGS, sampleSeconds: 2, alerts: { ...DEFAULT_SETTINGS.alerts, emails: ['Ops@Example.com'] } } } })
    expect(res.status).toBe(200)
    const got = (await (await call('/admin/monitor/settings')).json()) as { settings: { sampleSeconds: number; alerts: { emails: string[] } } }
    expect(got.settings.sampleSeconds).toBe(5)
    expect(got.settings.alerts.emails).toEqual(['ops@example.com'])
    expect(readAudit(ctx.config, 5)[0]).toMatchObject({ action: 'monitor.settings', ok: true })
  })

  it('queues a test alert and hands it over once', async () => {
    const { call } = await setup()
    await call('/admin/monitor/alerts/test', { method: 'POST' })
    const box = (await (await call('/admin/monitor/alerts/outbox')).json()) as { notifications: { id: number; kind: string }[] }
    expect(box.notifications.map((n) => n.kind)).toEqual(['test'])
    await call('/admin/monitor/alerts/outbox', { method: 'POST', body: { ids: box.notifications.map((n) => n.id) } })
    const again = (await (await call('/admin/monitor/alerts/outbox')).json()) as { notifications: unknown[] }
    expect(again.notifications).toEqual([])
  })

  it('reports traffic, security, capacity and a month of usage', async () => {
    const { call } = await setup()
    expect((await call('/admin/monitor/traffic')).status).toBe(200)
    expect((await call('/admin/monitor/security')).status).toBe(200)
    const cap = (await (await call('/admin/monitor/capacity')).json()) as { forecasts: { kind: string }[] }
    expect(cap.forecasts.some((f) => f.kind === 'disk')).toBe(true)
    const month = new Date().toISOString().slice(0, 7)
    const usage = (await (await call(`/admin/monitor/usage?month=${month}`)).json()) as { sites: { site: string }[] }
    expect(usage.sites.map((s) => s.site)).toEqual(['shop'])
    expect((await call('/admin/monitor/usage?month=nope')).status).toBe(400)
  })

  it('gives Prometheus the figures with its own token, and nothing else', async () => {
    const { call, ctx } = await setup()
    expect((await call('/metrics')).status).toBe(401)
    const token = newMetricsToken(ctx.host)
    const res = await call('/metrics', { token })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('cactus_memory_total_bytes 1024000')
    expect((await call('/admin/monitor/live', { token })).status).toBe(401)
  })
})
