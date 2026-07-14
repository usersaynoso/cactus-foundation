import { describe, it, expect } from 'vitest'
import { planStarterCleanup, stableStringify, type LayoutRow } from './starterLayouts'
import { allStarterTemplates, CORE_STARTER_TEMPLATES, type StarterTemplate } from '@/lib/layout/starter-templates'

// planStarterCleanup decides which rows get deleted from a live site's database.
// Getting it wrong deletes a layout somebody built, so the interesting cases are
// all the ones where it must say NO.

const template: StarterTemplate = {
  id: 'starter-header',
  name: 'Default Header',
  description: 'Logo left, nav right.',
  data: {
    content: [{ type: 'SiteLogo', props: { id: 'logo-1', logoHeight: 40 } }],
    root: { props: { height: '64px' } },
    zones: {},
  },
}
const templates = [{ type: 'header', template }]

const NO_CONDITIONS = { include: [], exclude: [] }
const SITE_WIDE = { include: [{ type: 'entire_site' }], exclude: [] }

const row = (over: Partial<LayoutRow>): LayoutRow => ({
  id: 'starter-header-live',
  builderData: template.data,
  displayConditions: NO_CONDITIONS,
  ...over,
})

describe('planStarterCleanup', () => {
  it('deletes an untouched, condition-less copy of a template', () => {
    expect(planStarterCleanup([row({})], templates)).toEqual(['starter-header-live'])
  })

  it('deletes the "(Copy)" drafts the old migration branch spawned', () => {
    expect(planStarterCleanup([row({ id: 'starter-header-edited' })], templates)).toEqual(['starter-header-edited'])
  })

  it('keeps a copy that is actually live', () => {
    expect(planStarterCleanup([row({ displayConditions: SITE_WIDE })], templates)).toEqual([])
  })

  it('keeps a copy the owner has edited, even with no conditions', () => {
    const edited = { ...template.data, root: { props: { height: '80px' } } }
    expect(planStarterCleanup([row({ builderData: edited })], templates)).toEqual([])
  })

  it('keeps a copy whose content was emptied out', () => {
    expect(planStarterCleanup([row({ builderData: { content: [], root: { props: {} }, zones: {} } })], templates)).toEqual([])
  })

  it('never touches a layout the owner created', () => {
    const own = row({ id: 'cmr6tone90000rngfpeip28gn', builderData: template.data })
    expect(planStarterCleanup([own], templates)).toEqual([])
  })

  it('never touches a row that merely starts with a template id', () => {
    expect(planStarterCleanup([row({ id: 'starter-header' })], templates)).toEqual([])
    expect(planStarterCleanup([row({ id: 'starter-header-live-2' })], templates)).toEqual([])
  })

  it('treats a jsonb key reorder as unchanged (Postgres does not preserve key order)', () => {
    const reordered = {
      zones: {},
      root: { props: { height: '64px' } },
      content: [{ props: { logoHeight: 40, id: 'logo-1' }, type: 'SiteLogo' }],
    }
    expect(planStarterCleanup([row({ builderData: reordered })], templates)).toEqual(['starter-header-live'])
  })

  it('handles a null builderData without deleting it', () => {
    expect(planStarterCleanup([row({ builderData: null })], templates)).toEqual([])
  })

  it('handles a null displayConditions as "no conditions"', () => {
    expect(planStarterCleanup([row({ displayConditions: null })], templates)).toEqual(['starter-header-live'])
  })
})

describe('stableStringify', () => {
  it('sorts keys at every depth', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }))
  })

  it('does not sort array order, which is meaningful in Puck content', () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]))
  })
})

describe('starter template catalogue', () => {
  const all = allStarterTemplates()

  it('has no duplicate template ids', () => {
    const ids = all.map((t) => t.template.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every core layout type at least one starting point', () => {
    for (const [type, list] of Object.entries(CORE_STARTER_TEMPLATES)) {
      expect(list.length, `${type} has no templates`).toBeGreaterThan(0)
    }
  })

  it('publishes exactly one default per core type that needs one live out of the box', () => {
    for (const type of ['header', 'footer', 'infoPage', 'notFound']) {
      const defaults = (CORE_STARTER_TEMPLATES[type] ?? []).filter((t) => t.publishByDefault)
      expect(defaults.length, `${type} should seed exactly one default`).toBe(1)
    }
    // The status page is the exception: coming-soon and maintenance are two
    // different screens, gated by two different site statuses, so both seed.
    const statusDefaults = (CORE_STARTER_TEMPLATES.statusPage ?? []).filter((t) => t.publishByDefault)
    expect(statusDefaults.length).toBe(2)
  })

  it('gives every page layout a content slot, or the page it wraps renders nothing', () => {
    const hasSlot = (data: StarterTemplate['data']): boolean => {
      const walk = (blocks: unknown): boolean =>
        Array.isArray(blocks) && blocks.some((b) => {
          const block = b as { type?: string; props?: Record<string, unknown> }
          if (block.type === 'ContentSlot') return true
          const props = block.props ?? {}
          return ['content', 'items', 'col1', 'col2', 'col3', 'col4'].some((k) => walk(props[k]))
        })
      return walk(data.content) || Object.values(data.zones ?? {}).some(walk)
    }
    for (const t of CORE_STARTER_TEMPLATES.infoPage ?? []) {
      expect(hasSlot(t.data), `${t.id} has no ContentSlot`).toBe(true)
    }
  })
})
