import { describe, expect, it, vi } from 'vitest'
import type { MenuEntityProvider } from '@/lib/modules/menu-entity-provider'
import { listHomepageModuleOptions, resolveHomepageModuleTarget } from './module-homepage'

// A test-only provider in the shape TG Finance ships: one kind, a fixed list of
// screens, every one public. Nothing here is a real module.
function provider(over: Partial<MenuEntityProvider> = {}): MenuEntityProvider {
  const screens: Record<string, { label: string; href: string }> = {
    money: { label: 'Money', href: '/money' },
    calendar: { label: 'Calendar', href: '/money/calendar' },
  }
  return {
    moduleLabel: 'TG Finance',
    listKinds: () => [{ id: 'screens', label: 'Money screens' }],
    searchEntities: async (kind) => kind === 'screens'
      ? Object.entries(screens).map(([id, s]) => ({ id, label: s.label, hint: `The ${s.label} screen` }))
      : [],
    resolveEntity: async (kind, id) => {
      const s = kind === 'screens' ? screens[id] : undefined
      return s ? { ...s, publiclyVisible: true } : null
    },
    ...over,
  }
}

const TARGET = { moduleId: 'tg-finance', kind: 'screens', entityId: 'money' }

describe('resolveHomepageModuleTarget', () => {
  it('resolves to the provider href', async () => {
    expect(await resolveHomepageModuleTarget(TARGET, { 'tg-finance': provider() }))
      .toEqual({ ok: true, href: '/money', label: 'Money' })
  })

  it('reports a module that is no longer installed', async () => {
    expect(await resolveHomepageModuleTarget(TARGET, {})).toEqual({ ok: false, reason: 'no-provider' })
  })

  it('reports content the provider no longer knows', async () => {
    expect(await resolveHomepageModuleTarget({ ...TARGET, entityId: 'gone' }, { 'tg-finance': provider() }))
      .toEqual({ ok: false, reason: 'not-found' })
  })

  it('refuses content the provider says is not public', async () => {
    const p = provider({ resolveEntity: async () => ({ label: 'Draft', href: '/draft', publiclyVisible: false }) })
    expect(await resolveHomepageModuleTarget(TARGET, { 'tg-finance': p }))
      .toEqual({ ok: false, reason: 'not-public', label: 'Draft' })
  })

  it('refuses an href that leaves the site or points back at /', async () => {
    const offsite = provider({ resolveEntity: async () => ({ label: 'Away', href: 'https://elsewhere.example/', publiclyVisible: true }) })
    expect(await resolveHomepageModuleTarget(TARGET, { 'tg-finance': offsite }))
      .toEqual({ ok: false, reason: 'unsafe-href', label: 'Away' })
    const loop = provider({ resolveEntity: async () => ({ label: 'Root', href: '/', publiclyVisible: true }) })
    expect(await resolveHomepageModuleTarget(TARGET, { 'tg-finance': loop }))
      .toEqual({ ok: false, reason: 'unsafe-href', label: 'Root' })
  })

  it('swallows a provider that throws, so the homepage still renders', async () => {
    const p = provider({ resolveEntity: async () => { throw new Error('db down') } })
    expect(await resolveHomepageModuleTarget(TARGET, { 'tg-finance': p })).toEqual({ ok: false, reason: 'error' })
  })
})

describe('listHomepageModuleOptions', () => {
  it('groups every provider kind with its entries', async () => {
    expect(await listHomepageModuleOptions({ 'tg-finance': provider() })).toEqual([
      {
        moduleId: 'tg-finance',
        moduleLabel: 'TG Finance',
        kind: 'screens',
        kindLabel: 'Money screens',
        entries: [
          { id: 'money', label: 'Money', hint: 'The Money screen' },
          { id: 'calendar', label: 'Calendar', hint: 'The Calendar screen' },
        ],
      },
    ])
  })

  it('asks each kind with an empty query, as the menu picker does on open', async () => {
    const searchEntities = vi.fn(async () => [])
    await listHomepageModuleOptions({ m: provider({ searchEntities }) })
    expect(searchEntities).toHaveBeenCalledWith('screens', '')
  })

  it('leaves out empty kinds and a provider that throws, keeping the rest', async () => {
    const broken = provider({ moduleLabel: 'Broken', listKinds: () => { throw new Error('nope') } })
    const failing = provider({ moduleLabel: 'Failing', searchEntities: async () => { throw new Error('nope') } })
    const empty = provider({ moduleLabel: 'Empty', searchEntities: async () => [] })
    const groups = await listHomepageModuleOptions({ broken, failing, empty, 'tg-finance': provider() })
    expect(groups.map((g) => g.moduleId)).toEqual(['tg-finance'])
  })

  it('caps a long list', async () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ id: `p${i}`, label: `Post ${i}` }))
    const groups = await listHomepageModuleOptions({ blog: provider({ searchEntities: async () => many }) })
    expect(groups[0]?.entries).toHaveLength(200)
  })

  it('sorts groups by module then kind label', async () => {
    const a = provider({ moduleLabel: 'Zebra' })
    const b = provider({ moduleLabel: 'Aardvark', listKinds: () => [{ id: 'y', label: 'Yaks' }, { id: 'b', label: 'Bees' }], searchEntities: async () => [{ id: '1', label: 'One' }] })
    const groups = await listHomepageModuleOptions({ a, b })
    expect(groups.map((g) => `${g.moduleLabel}/${g.kindLabel}`)).toEqual(['Aardvark/Bees', 'Aardvark/Yaks', 'Zebra/Money screens'])
  })
})
