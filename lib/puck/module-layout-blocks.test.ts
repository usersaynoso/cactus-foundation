import { describe, it, expect } from 'vitest'
import { getModuleLayoutPuckConfig, puckConfig } from '@/lib/puck/config'
import { moduleComponents } from '@/lib/puck/module-components'
import { moduleStarterLayouts, moduleLayoutStarterContributions } from '@/lib/setup/module-starter-layouts'

// A module layout's component set is the only one in lib/puck/config.tsx built
// from the category pickers rather than from `puckConfig.components`, so a name
// dropped from a category is not merely hidden there - it is UNREGISTERED, and
// Puck renders nothing whatsoever for a type its config has never heard of.
//
// That is how v0.5.1053 blanked the whole two-column half of every live product
// page and the checkout: it took 'Split' out of the layout picker (correctly -
// Split cannot work inside a slot) and, with it, out of every module layout's
// config. The pages still served a 200 with the tabs, the description and the
// footer, and nothing where the gallery, price, options, add to basket and
// accessories used to be. tsc, eslint and the rest of the suite all stayed
// green, because nothing here is a type error.
//
// So: every CORE block the shipped starter layouts use must be registered in
// that layout type's config. Retiring a block from the pickers is fine; leaving
// the render path unable to name it is not. Module-declared blocks are checked
// against the same starters but skipped here, because a module block absent
// from a layout type is its own manifest's `layoutTypes` list to answer for,
// not core's - and this repo's modules/ tree is only a build-time clone.
function collectBlockTypes(data: unknown): string[] {
  const types: string[] = []
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (!node || typeof node !== 'object') return
    const rec = node as Record<string, unknown>
    if (typeof rec.type === 'string' && rec.props && typeof rec.props === 'object') types.push(rec.type)
    Object.values(rec).forEach(walk)
  }
  walk(data)
  return types
}

// Every block core itself defines, whatever its picker status. `puckConfig`
// carries the module blocks too (the page config offers them), so they come
// back out again - what a module block is offered on is its manifest's
// `layoutTypes` to answer for, not core's.
const moduleBlocks = new Set(Object.keys(moduleComponents))
const coreBlocks = new Set(Object.keys(puckConfig.components).filter((n) => !moduleBlocks.has(n)))

describe('module layout configs register every core block their starters use', () => {
  for (const [layoutType, starters] of Object.entries(moduleStarterLayouts)) {
    it(`${layoutType}`, () => {
      const registered = new Set(Object.keys(getModuleLayoutPuckConfig(layoutType).components))
      const used = new Set(starters().flatMap((s) => collectBlockTypes(s.data)))
      const missing = [...used].filter((t) => coreBlocks.has(t) && !registered.has(t)).sort()
      expect(missing, `unregistered in ${layoutType}: ${missing.join(', ')}`).toEqual([])
    })
  }
})

// Starters a module contributes to a layout type it does NOT own - `documentFooter`
// today. Same hazard, one step further from the module that has to fix it: the
// template is shop's, the layout type is core's, and the blocks on it only render
// there if the module also named that type in its own `layoutTypes`. Get the
// manifest half right and the starter half wrong and the picker offers a template
// that stamps out blank space.
describe('contributed starters use blocks the layout type actually registers', () => {
  for (const [layoutType, builds] of Object.entries(moduleLayoutStarterContributions)) {
    it(`${layoutType}`, () => {
      const registered = new Set(Object.keys(getModuleLayoutPuckConfig(layoutType).components))
      const used = new Set(builds.flatMap((build) => build().flatMap((s) => collectBlockTypes(s.data))))
      const missing = [...used].filter((t) => !registered.has(t)).sort()
      expect(missing, `unregistered in ${layoutType}: ${missing.join(', ')}`).toEqual([])
    })
  }
})

describe('retired blocks stay renderable in module layouts', () => {
  // Split and the dynamic Grid are deliberately absent from every picker but
  // must keep rendering wherever saved data already names them.
  it.each(['Split', 'Grid'])('%s is still registered', (name) => {
    expect(Object.keys(getModuleLayoutPuckConfig('shopProductDetail').components)).toContain(name)
  })
})
