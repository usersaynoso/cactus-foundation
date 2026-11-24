import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MenuEntityProvider } from '@/lib/modules/menu-entity-provider'

// Backs the module half of Settings > General > Homepage: every piece of content
// a core.menu-entity-provider offers, grouped by module and kind, plus whether the
// stored module homepage (if any) still resolves - the select warns when not.

const state = vi.hoisted(() => ({
  user: { id: 'u1' } as null | { id: string },
  allowed: true,
  config: null as null | Record<string, unknown>,
}))
const providers = vi.hoisted(() => ({} as Record<string, MenuEntityProvider>))

vi.mock('@/lib/auth/session', () => ({ getSessionFromCookie: vi.fn(async () => state.user) }))
vi.mock('@/lib/permissions/check', () => ({ hasPermission: vi.fn(async () => state.allowed) }))
vi.mock('@/lib/db/prisma', () => ({
  prisma: { siteConfig: { findUnique: vi.fn(async () => state.config) } },
}))
vi.mock('@/lib/modules/menu-entity-provider', () => ({ getMenuEntityProviders: () => providers }))

const { GET } = await import('./route')

// Test-only provider, shaped like the one TG Finance ships.
const tgFinance: MenuEntityProvider = {
  moduleLabel: 'TG Finance',
  listKinds: () => [{ id: 'screens', label: 'Money screens' }],
  searchEntities: async () => [{ id: 'money', label: 'Money', hint: 'The home of the web app' }],
  resolveEntity: async (_k, id) => id === 'money' ? { label: 'Money', href: '/money', publiclyVisible: true } : null,
}

beforeEach(() => {
  for (const k of Object.keys(providers)) delete providers[k]
  state.user = { id: 'u1' }
  state.allowed = true
  state.config = { homepageModuleId: null, homepageEntityKind: null, homepageEntityId: null }
})

describe('GET /api/admin/config/homepage-options', () => {
  it('needs a session and config.manage', async () => {
    state.user = null
    expect((await GET()).status).toBe(401)
    state.user = { id: 'u1' }
    state.allowed = false
    expect((await GET()).status).toBe(403)
  })

  it('lists provider content grouped by module and kind', async () => {
    providers['tg-finance'] = tgFinance
    const body = await (await GET()).json()
    expect(body.groups).toEqual([{
      moduleId: 'tg-finance', moduleLabel: 'TG Finance', kind: 'screens', kindLabel: 'Money screens',
      entries: [{ id: 'money', label: 'Money', hint: 'The home of the web app' }],
    }])
    expect(body.current).toBeNull()
  })

  it('reports a stored module homepage that still resolves', async () => {
    providers['tg-finance'] = tgFinance
    state.config = { homepageModuleId: 'tg-finance', homepageEntityKind: 'screens', homepageEntityId: 'money' }
    const body = await (await GET()).json()
    expect(body.current).toEqual({
      moduleId: 'tg-finance', kind: 'screens', entityId: 'money',
      ok: true, label: 'Money', href: '/money', moduleLabel: 'TG Finance',
    })
  })

  it('reports a stored module homepage whose content has gone', async () => {
    providers['tg-finance'] = tgFinance
    state.config = { homepageModuleId: 'tg-finance', homepageEntityKind: 'screens', homepageEntityId: 'deleted' }
    const body = await (await GET()).json()
    expect(body.current).toMatchObject({ ok: false, reason: 'not-found', entityId: 'deleted', moduleLabel: 'TG Finance' })
  })

  it('reports a stored module homepage whose module has gone', async () => {
    state.config = { homepageModuleId: 'tg-finance', homepageEntityKind: 'screens', homepageEntityId: 'money' }
    const body = await (await GET()).json()
    expect(body.current).toMatchObject({ ok: false, reason: 'no-provider', moduleLabel: null })
    expect(body.groups).toEqual([])
  })
})
