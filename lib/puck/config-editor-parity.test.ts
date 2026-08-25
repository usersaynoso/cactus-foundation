import { describe, it, expect } from 'vitest'
import {
  puckConfig,
  layoutPuckConfig,
  headerPuckConfig,
  footerPuckConfig,
  getModuleLayoutPuckConfig,
} from '@/lib/puck/config'
import { puckConfig as corePuckConfig } from '@/lib/puck/config.core'
import { moduleComponents, moduleComponentsByLayoutType } from '@/lib/puck/module-components'

// config.core.tsx builds the core-only configs; config.tsx merges the module
// blocks back in for the editor. Everything here is about that merge still doing
// what the single file did before it was split.
//
// A block that fails to register does not warn - Puck renders nothing at all for
// a type its config has never heard of, which is how v0.5.1053 blanked half of
// every live product page (see module-layout-blocks.test.ts).

const moduleNames = Object.keys(moduleComponents)

describe('the editor config still carries every module block', () => {
  it('has module blocks to test with at all', () => {
    // Nothing below proves anything on a checkout with no modules installed.
    expect(moduleNames.length).toBeGreaterThan(0)
  })

  it.each([
    ['puckConfig', () => puckConfig],
    ['layoutPuckConfig', () => layoutPuckConfig],
  ])('%s registers all of them', (_name, get) => {
    const components = get().components as Record<string, unknown>
    expect(moduleNames.filter((n) => !components[n])).toEqual([])
  })

  it.each([
    ['puckConfig', () => puckConfig],
    ['layoutPuckConfig', () => layoutPuckConfig],
  ])('%s offers them in the Modules category', (_name, get) => {
    expect((get().categories as any).modules?.components).toEqual(moduleNames)
  })

  it('header and footer carry the blocks that opted into them, and no others', () => {
    for (const [layoutType, config] of [
      ['header', headerPuckConfig],
      ['footer', footerPuckConfig],
    ] as const) {
      const opted = Object.keys(moduleComponentsByLayoutType[layoutType] ?? {})
      const components = config.components as Record<string, unknown>
      expect(opted.filter((n) => !components[n])).toEqual([])
      // A block that did NOT opt in must not appear - the header picker listing
      // every shop block is exactly what layoutTypes exists to prevent.
      expect(moduleNames.filter((n) => !opted.includes(n) && components[n])).toEqual([])
    }
  })

  it('a module layout config still registers its own blocks', () => {
    for (const layoutType of Object.keys(moduleComponentsByLayoutType)) {
      const expected = Object.keys(moduleComponentsByLayoutType[layoutType] ?? {})
      if (expected.length === 0) continue
      const components = getModuleLayoutPuckConfig(layoutType).components as Record<string, unknown>
      expect(expected.filter((n) => !components[n])).toEqual([])
    }
  })

  // The merge happens after config.core.tsx has wrapped its own blocks, so the
  // wrapper has to apply withResponsiveVisibility itself. Miss it and a module
  // block's "hide on mobile" silently disappears from the editor panel.
  it('module blocks get the responsive-visibility treatment, same as core blocks', () => {
    for (const name of moduleNames) {
      const def = (puckConfig.components as any)[name]
      // A block may declare its own `visibility` field, which legitimately wins
      // (see the known field-name collision) - what matters is that the key is
      // there at all and that the block is a WRAPPED copy, not the raw def.
      expect(def.fields?.visibility, `${name} has no visibility field`).toBeDefined()
      expect(def.defaultProps?.visibility, `${name} has no visibility default`).toBeDefined()
      expect(typeof def.resolveFields, `${name} lost the applicable-only field trims`).toBe('function')
      expect(def, `${name} was merged in unwrapped`).not.toBe((moduleComponents as any)[name])
    }
  })

  // The split must be invisible from outside: core blocks are untouched by it.
  it('leaves core blocks exactly as config.core built them', () => {
    for (const name of Object.keys(corePuckConfig.components)) {
      expect((puckConfig.components as any)[name]).toBe((corePuckConfig.components as any)[name])
    }
  })
})
