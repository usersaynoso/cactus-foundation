import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MenuEntityProvider } from '@/lib/modules/menu-entity-provider'

// The root route when Settings > General > Homepage names module content rather
// than an info page: / answers with a temporary redirect to wherever the module's
// core.menu-entity-provider says that content lives, and falls back to today's
// behaviour (a page if one is somehow still assigned, otherwise the welcome
// screen) whenever the provider cannot vouch for it.

const db = vi.hoisted(() => ({
  config: null as null | Record<string, unknown>,
  page: null as null | Record<string, unknown>,
}))

const providers = vi.hoisted(() => ({} as Record<string, MenuEntityProvider>))

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    siteConfig: { findUnique: vi.fn(async () => db.config) },
    infoPage: { findUnique: vi.fn(async () => db.page) },
    media: { findUnique: vi.fn(async () => null) },
  },
}))

// redirect() throws in Next; the fake does the same so control flow matches.
class RedirectSignal extends Error {
  constructor(public url: string) { super(`redirect:${url}`) }
}
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new RedirectSignal(url) },
}))

vi.mock('@/lib/auth/session', () => ({ getSessionFromCookie: vi.fn(async () => null) }))
vi.mock('@/lib/permissions/check', () => ({ isAdmin: () => false }))
vi.mock('@/lib/puck/renderInfoPage', () => ({
  renderInfoPageContent: (page: { id: string }) => ({ rendered: page.id }),
}))
vi.mock('@/lib/config/branding', () => ({ resolveBranding: async () => ({ state: 'ok', name: 'Site' }) }))
vi.mock('@/lib/seo/public-metadata', () => ({
  canonicalPath: () => '/',
  withPublicSeo: (m: object) => m,
}))
vi.mock('@/lib/modules/menu-entity-provider', () => ({
  getMenuEntityProviders: () => providers,
}))

const { default: RootPage } = await import('./page')

function fakeProvider(over: Partial<MenuEntityProvider> = {}): MenuEntityProvider {
  return {
    moduleLabel: 'TG Finance',
    listKinds: () => [{ id: 'screens', label: 'Money screens' }],
    searchEntities: async () => [],
    resolveEntity: async (_kind, id) => id === 'money' ? { label: 'Money', href: '/money', publiclyVisible: true } : null,
    ...over,
  }
}

const BASE = {
  setupCompleted: true, siteName: 'Taylor-Guest', tagline: null, description: null,
  homepageId: null, homepageModuleId: null, homepageEntityKind: null, homepageEntityId: null,
}
const MODULE_HOME = { homepageModuleId: 'tg-finance', homepageEntityKind: 'screens', homepageEntityId: 'money' }

async function render(): Promise<{ redirect?: string; result?: unknown }> {
  try {
    return { result: await RootPage() }
  } catch (err) {
    if (err instanceof RedirectSignal) return { redirect: err.url }
    throw err
  }
}

beforeEach(() => {
  for (const k of Object.keys(providers)) delete providers[k]
  db.config = { ...BASE }
  db.page = null
})

describe('/ with a module homepage', () => {
  it('redirects to the provider href', async () => {
    providers['tg-finance'] = fakeProvider()
    db.config = { ...BASE, ...MODULE_HOME }
    expect(await render()).toEqual({ redirect: '/money' })
  })

  it('shows the welcome screen when the module is gone', async () => {
    db.config = { ...BASE, ...MODULE_HOME }
    const { redirect, result } = await render()
    expect(redirect).toBeUndefined()
    expect(JSON.stringify(result)).toContain('Taylor-Guest')
  })

  it('shows the welcome screen when the content is gone', async () => {
    providers['tg-finance'] = fakeProvider()
    db.config = { ...BASE, ...MODULE_HOME, homepageEntityId: 'deleted' }
    const { redirect, result } = await render()
    expect(redirect).toBeUndefined()
    expect(JSON.stringify(result)).toContain('Taylor-Guest')
  })

  it('shows the welcome screen when the provider throws', async () => {
    providers['tg-finance'] = fakeProvider({ resolveEntity: async () => { throw new Error('db down') } })
    db.config = { ...BASE, ...MODULE_HOME }
    expect((await render()).redirect).toBeUndefined()
  })

  it('never redirects off the site', async () => {
    providers['tg-finance'] = fakeProvider({ resolveEntity: async () => ({ label: 'x', href: '//evil.example', publiclyVisible: true }) })
    db.config = { ...BASE, ...MODULE_HOME }
    expect((await render()).redirect).toBeUndefined()
  })

  it('falls back to an assigned page when the module content will not resolve', async () => {
    db.config = { ...BASE, ...MODULE_HOME, homepageId: 'page1' }
    db.page = { id: 'page1', status: 'published' }
    expect(await render()).toEqual({ result: { rendered: 'page1' } })
  })

  it('still sends an unfinished site to setup first', async () => {
    providers['tg-finance'] = fakeProvider()
    db.config = { ...BASE, ...MODULE_HOME, setupCompleted: false }
    expect(await render()).toEqual({ redirect: '/setup' })
  })
})

describe('/ with a page homepage (unchanged)', () => {
  it('renders the assigned page', async () => {
    db.config = { ...BASE, homepageId: 'page1' }
    db.page = { id: 'page1', status: 'published' }
    expect(await render()).toEqual({ result: { rendered: 'page1' } })
  })

  it('does not consult module providers when no module target is stored', async () => {
    const resolveEntity = vi.fn(async () => null)
    providers['tg-finance'] = fakeProvider({ resolveEntity })
    db.config = { ...BASE, homepageId: 'page1' }
    db.page = { id: 'page1', status: 'published' }
    await render()
    expect(resolveEntity).not.toHaveBeenCalled()
  })
})
