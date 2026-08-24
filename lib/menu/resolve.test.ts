import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MenuEntityProvider, ResolvedMenuEntity } from '@/lib/modules/menu-entity-provider'

// Menu items the fake database hands back, in `order`.
let ITEMS: Record<string, unknown>[] = []

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    menuItem: { findMany: vi.fn(async () => ITEMS) },
  },
}))

vi.mock('@/lib/config/site', () => ({
  getSiteConfig: vi.fn(async () => ({ mainMenuId: 'menu-1' })),
}))

const providers: Record<string, MenuEntityProvider> = {}
vi.mock('@/lib/modules/menu-entity-provider', () => ({
  getMenuEntityProvider: (moduleId: string) => providers[moduleId] ?? null,
}))

const { resolveMenu } = await import('@/lib/menu/resolve')

function item(over: Record<string, unknown>) {
  return {
    id: 'i1', parentId: null, order: 0, label: null, url: null, type: 'MODULE_ENTITY',
    visibility: 'PUBLIC', openInNewTab: false, page: null,
    moduleId: 'shop', entityKind: 'category', entityId: 'c1',
    ...over,
  }
}

function fakeProvider(over: Partial<MenuEntityProvider> = {}): MenuEntityProvider {
  return {
    moduleLabel: 'Shop',
    listKinds: () => [],
    searchEntities: async () => [],
    resolveEntity: async (_kind, id) => ({ label: `one-${id}`, href: `/one/${id}`, publiclyVisible: true }),
    ...over,
  }
}

beforeEach(() => {
  for (const key of Object.keys(providers)) delete providers[key]
  ITEMS = []
})

describe('resolveMenu: module-entity batching', () => {
  it('asks a batching provider once for every id of a kind, not once per item', async () => {
    const resolveEntities = vi.fn(async (_kind: string, ids: string[]) => {
      const map = new Map<string, ResolvedMenuEntity>()
      for (const id of ids) map.set(id, { label: `cat-${id}`, href: `/shop/categories/${id}`, publiclyVisible: true })
      return map
    })
    const resolveEntity = vi.fn()
    providers.shop = fakeProvider({ resolveEntities, resolveEntity })

    ITEMS = [
      item({ id: 'a', order: 0, entityId: 'c1' }),
      item({ id: 'b', order: 1, entityId: 'c2' }),
      item({ id: 'c', order: 2, entityId: 'c3' }),
    ]

    const tree = await resolveMenu('menu-1', { isAuthenticated: false, isAdmin: false })

    // The whole point: one call carrying every id, rather than three calls.
    expect(resolveEntities).toHaveBeenCalledTimes(1)
    expect(resolveEntities.mock.calls[0]![0]).toBe('category')
    expect([...resolveEntities.mock.calls[0]![1]].sort()).toEqual(['c1', 'c2', 'c3'])
    expect(resolveEntity).not.toHaveBeenCalled()
    expect(tree.map((n) => n.href)).toEqual(['/shop/categories/c1', '/shop/categories/c2', '/shop/categories/c3'])
  })

  it('falls back to the single-id method for a provider that offers no batch', async () => {
    const resolveEntity = vi.fn(async (_kind: string, id: string) => ({
      label: `cat-${id}`, href: `/shop/categories/${id}`, publiclyVisible: true,
    }))
    providers.shop = fakeProvider({ resolveEntity })

    ITEMS = [item({ id: 'a', order: 0, entityId: 'c1' }), item({ id: 'b', order: 1, entityId: 'c2' })]

    const tree = await resolveMenu('menu-1', { isAuthenticated: false, isAdmin: false })
    expect(resolveEntity).toHaveBeenCalledTimes(2)
    expect(tree.map((n) => n.label)).toEqual(['cat-c1', 'cat-c2'])
  })

  it('asks for each id once however many items point at it', async () => {
    const resolveEntities = vi.fn(async (_kind: string, ids: string[]) =>
      new Map(ids.map((id) => [id, { label: id, href: `/${id}`, publiclyVisible: true }])),
    )
    providers.shop = fakeProvider({ resolveEntities })
    ITEMS = [item({ id: 'a', order: 0, entityId: 'c1' }), item({ id: 'b', order: 1, entityId: 'c1' })]

    await resolveMenu('menu-1', { isAuthenticated: false, isAdmin: false })
    expect(resolveEntities.mock.calls[0]![1]).toEqual(['c1'])
  })

  it('splits the batches by kind and by module', async () => {
    const shopBatch = vi.fn(async (kind: string, ids: string[]) =>
      new Map(ids.map((id) => [id, { label: `${kind}-${id}`, href: `/${kind}/${id}`, publiclyVisible: true }])),
    )
    const gazetteBatch = vi.fn(async (_kind: string, ids: string[]) =>
      new Map(ids.map((id) => [id, { label: id, href: `/post/${id}`, publiclyVisible: true }])),
    )
    providers.shop = fakeProvider({ resolveEntities: shopBatch })
    providers.gazette = fakeProvider({ resolveEntities: gazetteBatch })

    ITEMS = [
      item({ id: 'a', order: 0, entityKind: 'category', entityId: 'c1' }),
      item({ id: 'b', order: 1, entityKind: 'product', entityId: 'p1' }),
      item({ id: 'c', order: 2, moduleId: 'gazette', entityKind: 'post', entityId: 'g1' }),
    ]

    await resolveMenu('menu-1', { isAuthenticated: false, isAdmin: false })
    expect(shopBatch).toHaveBeenCalledTimes(2)
    expect(gazetteBatch).toHaveBeenCalledTimes(1)
    expect(shopBatch.mock.calls.map((c) => c[0]).sort()).toEqual(['category', 'product'])
  })

  it('drops an entity the provider will not vouch for, and one it does not know', async () => {
    providers.shop = fakeProvider({
      resolveEntities: async (_kind, ids) => {
        const map = new Map<string, ResolvedMenuEntity>()
        for (const id of ids) {
          if (id === 'gone') continue                           // provider has nothing for it
          map.set(id, { label: id, href: `/${id}`, publiclyVisible: id !== 'draft' })
        }
        return map
      },
    })
    ITEMS = [
      item({ id: 'a', order: 0, entityId: 'live' }),
      item({ id: 'b', order: 1, entityId: 'draft' }),
      item({ id: 'c', order: 2, entityId: 'gone' }),
    ]

    const tree = await resolveMenu('menu-1', { isAuthenticated: false, isAdmin: false })
    expect(tree.map((n) => n.label)).toEqual(['live'])
  })

  it('never asks about an item the viewer is not allowed to see', async () => {
    const resolveEntities = vi.fn(async (_kind: string, ids: string[]) =>
      new Map(ids.map((id) => [id, { label: id, href: `/${id}`, publiclyVisible: true }])),
    )
    providers.shop = fakeProvider({ resolveEntities })
    ITEMS = [
      item({ id: 'a', order: 0, entityId: 'public-one', visibility: 'PUBLIC' }),
      item({ id: 'b', order: 1, entityId: 'staff-only', visibility: 'ADMIN' }),
    ]

    const tree = await resolveMenu('menu-1', { isAuthenticated: false, isAdmin: false })
    expect(resolveEntities.mock.calls[0]![1]).toEqual(['public-one'])
    expect(tree.map((n) => n.label)).toEqual(['public-one'])
  })

  it('loses only the broken provider’s items when one throws, not the whole menu', async () => {
    providers.shop = fakeProvider({ resolveEntities: async () => { throw new Error('boom') } })
    ITEMS = [
      item({ id: 'a', order: 0, entityId: 'c1' }),
      item({ id: 'b', order: 1, type: 'URL', url: '/about', label: 'About', moduleId: null, entityKind: null, entityId: null }),
    ]

    const tree = await resolveMenu('menu-1', { isAuthenticated: false, isAdmin: false })
    expect(tree.map((n) => n.href)).toEqual(['/about'])
  })

  it('keeps the nesting the tree walk built', async () => {
    providers.shop = fakeProvider({
      resolveEntities: async (_kind, ids) => new Map(ids.map((id) => [id, { label: id, href: `/${id}`, publiclyVisible: true }])),
    })
    ITEMS = [
      item({ id: 'parent', order: 0, entityId: 'p' }),
      item({ id: 'child', order: 1, parentId: 'parent', entityId: 'c' }),
    ]

    const tree = await resolveMenu('menu-1', { isAuthenticated: false, isAdmin: false })
    expect(tree).toHaveLength(1)
    expect(tree[0]!.label).toBe('p')
    expect(tree[0]!.children?.map((n) => n.label)).toEqual(['c'])
  })

  it('makes no provider call at all for a menu of plain pages and urls', async () => {
    const resolveEntities = vi.fn()
    providers.shop = fakeProvider({ resolveEntities })
    ITEMS = [
      item({ id: 'a', order: 0, type: 'URL', url: '/about', label: 'About', moduleId: null, entityKind: null, entityId: null }),
      item({ id: 'b', order: 1, type: 'PAGE', label: null, moduleId: null, entityKind: null, entityId: null,
             page: { slug: 'terms', status: 'published', title: 'Terms' } }),
    ]

    const tree = await resolveMenu('menu-1', { isAuthenticated: false, isAdmin: false })
    expect(resolveEntities).not.toHaveBeenCalled()
    expect(tree.map((n) => n.href)).toEqual(['/about', '/terms'])
  })
})
