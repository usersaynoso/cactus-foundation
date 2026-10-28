import { describe, it, expect, afterEach, vi } from 'vitest'
import type * as NodeSeam from './data'

// lib/proxy/data.ts is the contract; data.netlify.ts is swapped in for it on
// Netlify builds. The assignment below is the real test: tsc refuses it if the
// Netlify file is missing an export or has a different signature.

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('proxy data seam', () => {
  it('exports the same functions on both platforms', async () => {
    const netlify = await import('./data.netlify')
    const asNode: typeof NodeSeam = netlify
    const node = await import('./data')
    expect(Object.keys(asNode).filter((k) => typeof (netlify as Record<string, unknown>)[k] === 'function').sort())
      .toEqual(expect.arrayContaining(Object.keys(node).filter((k) => typeof (node as Record<string, unknown>)[k] === 'function').sort()))
  })

  // The Netlify file must never bring Prisma into the edge bundle. A static
  // import would show up as a module-level import of these paths.
  it('never imports anything that reaches the database', async () => {
    const { readFileSync } = await import('fs')
    const src = readFileSync(new URL('./data.netlify.ts', import.meta.url), 'utf8')
    const runtimeImports = [...src.matchAll(/^import (?!type )[^'"]*from ['"]([^'"]+)['"]/gm)].map((m) => m[1])
    expect(runtimeImports).toEqual(['./protocol'])
  })
})

describe('Netlify proxy data', () => {
  it('asks the data route once for a burst of reads, with the shared key', async () => {
    vi.stubEnv('SESSION_SECRET', 's'.repeat(40))
    const calls: Array<{ url: string; key: string | null }> = []
    vi.stubGlobal('fetch', async (url: string, init?: { headers?: Record<string, string> }) => {
      calls.push({ url, key: init?.headers?.['x-cactus-proxy-key'] ?? null })
      return new Response(
        JSON.stringify({
          firstRunComplete: true,
          adminPath: 'secret-door',
          siteStatus: 'live',
          pageCache: { enabled: false, ttl: 60, longTtl: 3600, vercelEdgeTtl: 60, behindCloudflare: false },
          membersConfig: { enabled: false },
          routeTiers: [],
          failed: [],
        }),
        { status: 200 }
      )
    })
    vi.resetModules()
    const data = await import('./data.netlify')
    data.rememberRequestOrigin('https://example.netlify.app')
    const [first, admin, status] = await Promise.all([
      data.isFirstRunComplete(),
      data.getAdminPathCached(),
      data.getSiteStatusCached(),
    ])
    expect([first, admin, status]).toEqual([true, 'secret-door', 'live'])
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://example.netlify.app/api/internal/proxy-data')
    const { proxyKey } = await import('./protocol')
    expect(calls[0]?.key).toBe(await proxyKey('s'.repeat(40)))
  })

  it('carries the server verdict on a failed first-run read', async () => {
    vi.stubGlobal('fetch', async () =>
      new Response(JSON.stringify({ error: 'relation does not exist', unconfigured: true }), { status: 503 })
    )
    vi.resetModules()
    const data = await import('./data.netlify')
    data.rememberRequestOrigin('https://example.netlify.app')
    const err = await data.isFirstRunComplete().catch((e: unknown) => e)
    expect(data.gateFailureMeansUnconfigured(err)).toBe(true)
  })

  it('treats an unreachable route as an outage, not a fresh site', async () => {
    vi.stubGlobal('fetch', async () => new Response('Bad gateway', { status: 502 }))
    vi.resetModules()
    const data = await import('./data.netlify')
    data.rememberRequestOrigin('https://example.netlify.app')
    const err = await data.isFirstRunComplete().catch((e: unknown) => e)
    expect(data.gateFailureMeansUnconfigured(err)).toBe(false)
  })

  it('throws for a field the server could not read, as the direct read would have', async () => {
    vi.stubGlobal('fetch', async () =>
      new Response(
        JSON.stringify({
          firstRunComplete: true, adminPath: null, siteStatus: null, pageCache: null,
          membersConfig: null, routeTiers: null, failed: ['siteStatus'],
        }),
        { status: 200 }
      )
    )
    vi.resetModules()
    const data = await import('./data.netlify')
    data.rememberRequestOrigin('https://example.netlify.app')
    await expect(data.getSiteStatusCached()).rejects.toThrow('siteStatus')
    await expect(data.getAdminPathCached()).resolves.toBeNull()
  })
})
