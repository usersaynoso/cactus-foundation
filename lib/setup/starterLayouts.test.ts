import { describe, it, expect } from 'vitest'
import {
  planStarterCleanup,
  planOrphanLayoutTypes,
  planModuleSeeds,
  planModuleSeedTemplates,
  declaredLayoutTypesByModule,
  stableStringify,
  type LayoutRow,
} from './starterLayouts'
import {
  allStarterTemplates,
  coreStarterTemplates,
  moduleStarterTemplates,
  CORE_STARTER_TEMPLATES,
  type StarterTemplate,
} from '@/lib/layout/starter-templates'
import { moduleLayoutTypeToGroup } from '@/lib/layout/module-layout-types'

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

// Block props get renamed as the builder grows (logoHeight became cellHeight,
// and so on), so a copy the seeder stamped years ago no longer matches today's
// template even though nobody ever opened it. Content equality alone left those
// rows in the Layouts list for good, which is the clutter this whole change set
// out to clear. An untouched row's updatedAt never left its createdAt, and that
// does not rot.
describe('planStarterCleanup, on a copy stamped from an older template', () => {
  const stale = { content: [{ type: 'SiteLogo', props: { id: 'logo-1', cellHeight: 40 } }], root: { props: {} }, zones: {} }
  const at = (iso: string) => new Date(iso)

  const untouched = {
    builderData: stale,
    createdAt: at('2026-01-01T00:00:00.000Z'),
    updatedAt: at('2026-01-01T00:00:00.000Z'),
    publishedAt: null,
  }

  it('deletes it, though its content no longer matches the template', () => {
    expect(planStarterCleanup([row(untouched)], templates)).toEqual(['starter-header-live'])
  })

  it('allows the millisecond of slack between the row being created and stamped', () => {
    const r = row({ ...untouched, updatedAt: at('2026-01-01T00:00:00.400Z') })
    expect(planStarterCleanup([r], templates)).toEqual(['starter-header-live'])
  })

  it('keeps it once somebody has saved it', () => {
    const r = row({ ...untouched, updatedAt: at('2026-03-04T11:22:00.000Z') })
    expect(planStarterCleanup([r], templates)).toEqual([])
  })

  it('keeps it once somebody has published it', () => {
    const r = row({ ...untouched, publishedAt: at('2026-03-04T11:22:00.000Z') })
    expect(planStarterCleanup([r], templates)).toEqual([])
  })

  it('still refuses a live one, however untouched', () => {
    expect(planStarterCleanup([row({ ...untouched, displayConditions: SITE_WIDE })], templates)).toEqual([])
  })

  it('still refuses a layout the owner built, however untouched', () => {
    const own = row({ ...untouched, id: 'cmr6tone90000rngfpeip28gn' })
    expect(planStarterCleanup([own], templates)).toEqual([])
  })

  it('keeps a saved row whose content drifted, which is the owner\'s to delete', () => {
    const r = row({ builderData: stale, createdAt: at('2026-01-01T00:00:00.000Z'), updatedAt: at('2026-06-01T00:00:00.000Z') })
    expect(planStarterCleanup([r], templates)).toEqual([])
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
    // Every type whose job is to wrap something the surface hands it: a page's
    // body, the sign-in form on the login page, the same form in the panel the
    // header floats over it. One of these without a slot is a design with the
    // thing it was built around missing.
    for (const type of ['infoPage', 'memberLogin', 'memberLoginModal']) {
      for (const t of CORE_STARTER_TEMPLATES[type] ?? []) {
        expect(hasSlot(t.data), `${t.id} has no ContentSlot`).toBe(true)
      }
    }
  })
})

// The set a fresh site is seeded from. It runs at setup, when the site has no
// modules at all, so a module template reaching it means a site with no Shop gets
// Shop layouts stamped into its database - which is exactly what used to happen.
describe('seeding is core-only', () => {
  it('offers the seeder no module templates', () => {
    for (const { type } of coreStarterTemplates()) {
      expect(moduleLayoutTypeToGroup[type], `${type} is a module layout type`).toBeUndefined()
      expect(CORE_STARTER_TEMPLATES[type], `${type} is not a core layout type`).toBeDefined()
    }
  })

  it('still knows about the module templates, for the cleanup planner', () => {
    expect(allStarterTemplates().length).toBeGreaterThanOrEqual(coreStarterTemplates().length)
  })

  it('hands a module only its own templates', () => {
    const modules = new Set(Object.values(moduleLayoutTypeToGroup).map((g) => g.moduleName))
    for (const moduleName of modules) {
      for (const { type } of moduleStarterTemplates(moduleName)) {
        expect(moduleLayoutTypeToGroup[type]?.moduleName).toBe(moduleName)
      }
    }
  })
})

// Deciding which layouts get deleted from a live site, so the interesting cases are
// again the ones where it must say NO.
describe('planOrphanLayoutTypes', () => {
  const types = {
    shopIndex: { moduleName: 'shop' },
    shopCart: { moduleName: 'shop' },
    gazetteEntry: { moduleName: 'gazette' },
  }

  it('orphans the types of a module the site does not have', () => {
    expect(planOrphanLayoutTypes(types, new Set(['gazette']))).toEqual(['shopIndex', 'shopCart'])
  })

  it('keeps the types of a module the site has', () => {
    expect(planOrphanLayoutTypes(types, new Set(['shop', 'gazette']))).toEqual([])
  })

  it('keeps a module that is present only through its migration history', () => {
    // A code_only uninstall drops the Module row but keeps ModuleMigration, so the
    // tables (and the owner's layouts) survive for a reinstall to pick back up. The
    // caller unions both, so "present" covers it - binning those layouts would make a
    // liar of the mode.
    expect(planOrphanLayoutTypes(types, new Set(['shop', 'gazette']))).toEqual([])
  })

  it('orphans everything when the site has no modules at all', () => {
    expect(planOrphanLayoutTypes(types, new Set())).toEqual(['shopIndex', 'shopCart', 'gazetteEntry'])
  })

  it('has nothing to say about a build with no module layout types', () => {
    expect(planOrphanLayoutTypes({}, new Set())).toEqual([])
  })
})

// The bug this guards: a module's deploy is reconciled by whichever instance is
// serving, which is routinely the *previous* build - the one with no copy of the
// module's code. Seeding there finds no templates and writes nothing, and stamping
// layoutsSeededAt on top of that turns "seed once" into "never". A live Shop lost
// its product, index, checkout and confirmation layouts exactly that way, and 404ed
// every product URL, because those pages are Puck-only with no hardcoded fallback.
describe('planModuleSeeds', () => {
  const types = { shop: ['shopIndex', 'shopProduct'], gazette: ['gazetteCategory', 'gazetteEntry'] }
  const unstamped = [{ name: 'shop', layoutsSeededAt: null }, { name: 'gazette', layoutsSeededAt: null }]
  const stamped = (name: string) => ({ name, layoutsSeededAt: new Date('2026-08-15T04:59:49Z') })

  it('seeds a never-stamped module whose code is in this build', () => {
    expect(planModuleSeeds(unstamped, ['shop', 'gazette'], types, new Set())).toEqual(unstamped)
  })

  it('skips a module whose code this build does not have', () => {
    // Left unstamped on purpose: the deploy that brings the code seeds it properly.
    expect(planModuleSeeds(unstamped, ['gazette'], types, new Set())).toEqual([unstamped[1]])
  })

  it('skips everything when the build has no modules at all', () => {
    expect(planModuleSeeds(unstamped, [], types, new Set())).toEqual([])
  })

  // The gazette fault: stamped at install, nothing written (no template carried
  // publishByDefault), so "seed once" became "never" and no module release could
  // put it right. A stamped module with not one row across all its types gets
  // another go.
  it('seeds a stamped module that owns no layout of any type it declares', () => {
    expect(planModuleSeeds([stamped('gazette')], ['gazette'], types, new Set(['shopIndex'])))
      .toEqual([stamped('gazette')])
  })

  it('leaves a stamped module alone once it has a layout of any of its types', () => {
    // Deleting the layout for ONE type is a decision - falling back to the built-in
    // page - and re-minting it on the next update would change a live site unasked.
    expect(planModuleSeeds([stamped('shop')], ['shop'], types, new Set(['shopIndex']))).toEqual([])
  })

  it('leaves a stamped module alone when it declares no layout types at all', () => {
    expect(planModuleSeeds([stamped('twilio')], ['twilio'], types, new Set())).toEqual([])
  })

  it('has nothing to do when nothing is installed', () => {
    expect(planModuleSeeds([], ['shop'], types, new Set())).toEqual([])
  })
})

// publishByDefault used to be a precondition, so a module that never set it got no
// layouts at all - and the install stamped layoutsSeededAt regardless, which made it
// permanent. It is a preference now.
describe('planModuleSeedTemplates', () => {
  const t = (id: string, publishByDefault?: boolean): StarterTemplate => ({
    id, name: id, description: id, data: { content: [], root: { props: {} }, zones: {} },
    ...(publishByDefault === undefined ? {} : { publishByDefault }),
  })

  it('takes the flagged template when a type has one', () => {
    const entries = [
      { type: 'shopIndex', template: t('a') },
      { type: 'shopIndex', template: t('b', true) },
    ]
    expect(planModuleSeedTemplates(entries).map((e) => e.template.id)).toEqual(['b'])
  })

  it('takes every flagged template when a type marks more than one', () => {
    const entries = [
      { type: 'shopIndex', template: t('a', true) },
      { type: 'shopIndex', template: t('b', true) },
    ]
    expect(planModuleSeedTemplates(entries).map((e) => e.template.id)).toEqual(['a', 'b'])
  })

  it('falls back to the first template when a type flags none', () => {
    const entries = [
      { type: 'gazetteCategory', template: t('first') },
      { type: 'gazetteCategory', template: t('second') },
    ]
    expect(planModuleSeedTemplates(entries).map((e) => e.template.id)).toEqual(['first'])
  })

  it('seeds nothing for a type that says publishByDefault: false out loud', () => {
    const entries = [
      { type: 'shopCategory', template: t('a', false) },
      { type: 'shopCategory', template: t('b') },
    ]
    expect(planModuleSeedTemplates(entries)).toEqual([])
  })

  it('decides per type, not per module', () => {
    const entries = [
      { type: 'gazetteCategory', template: t('cat-first') },
      { type: 'gazetteEntry', template: t('entry-a') },
      { type: 'gazetteEntry', template: t('entry-b', true) },
    ]
    expect(planModuleSeedTemplates(entries).map((e) => e.template.id)).toEqual(['cat-first', 'entry-b'])
  })

  it('gives every layout type of every module in this build a default', () => {
    // The regression that started all this: open Layouts on a fresh install and no
    // module tab may be empty.
    for (const [moduleName, typeKeys] of Object.entries(declaredLayoutTypesByModule())) {
      const planned = planModuleSeedTemplates(moduleStarterTemplates(moduleName))
      const seededTypes = new Set(planned.map((e) => e.type))
      const declaredWithStarters = typeKeys.filter((key) =>
        moduleStarterTemplates(moduleName).some((e) => e.type === key),
      )
      for (const key of declaredWithStarters) {
        expect(seededTypes.has(key), `${moduleName}/${key} would seed nothing`).toBe(true)
      }
    }
  })
})
