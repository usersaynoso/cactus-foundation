import { describe, it, expect } from 'vitest'
import { planModuleRegistry } from './plan-module-registry.mjs'

const coreRegistry = {
  modules: [
    { name: 'shop', repoUrl: 'https://github.com/cactus-foundation-modules/shop', version: 'v0.1.370' },
    { name: 'unified-inbox', repoUrl: 'https://github.com/cactus-foundation-modules/unified-inbox', version: 'v0.1.25' },
  ],
}

describe('planModuleRegistry', () => {
  // The candidate is already on disk at the commit under test. Pinning a version
  // would send checkout-modules off to clone the last RELEASED tag instead, and
  // the gate would cheerfully pass a build of code nobody is proposing.
  it('leaves the candidate unpinned', () => {
    const plan = planModuleRegistry({
      manifest: { name: 'unified-inbox' },
      coreRegistry,
    })

    expect(plan.modules[0]).toEqual({
      name: 'unified-inbox',
      repoUrl: 'https://github.com/cactus-foundation-modules/unified-inbox',
    })
    expect(plan.modules[0]).not.toHaveProperty('version')
  })

  // Every manifest that has the field writes { name, minVersion } objects; the
  // field has carried bare strings before, and both mean the same to a build.
  it('adds required modules at the version core pins, from an object entry', () => {
    const plan = planModuleRegistry({
      manifest: { name: 'unified-inbox', requiresModules: [{ name: 'shop', minVersion: '0.1.336' }] },
      coreRegistry,
    })

    expect(plan.modules).toHaveLength(2)
    expect(plan.modules[1]).toEqual({
      name: 'shop',
      repoUrl: 'https://github.com/cactus-foundation-modules/shop',
      version: 'v0.1.370',
    })
  })

  it('accepts a bare string requirement too', () => {
    const plan = planModuleRegistry({
      manifest: { name: 'unified-inbox', requiresModules: ['shop'] },
      coreRegistry,
    })

    expect(plan.modules[1]?.version).toBe('v0.1.370')
  })

  // Otherwise the sibling builds at a version the candidate was never written
  // against, and the gate goes red pointing at the wrong module.
  it('raises a required module to its declared floor when core pins lower', () => {
    const plan = planModuleRegistry({
      manifest: { name: 'unified-inbox', requiresModules: [{ name: 'shop', minVersion: '0.1.400' }] },
      coreRegistry,
    })

    expect(plan.modules[1]?.version).toBe('v0.1.400')
  })

  it('adds nothing else, so a sibling module cannot fail this build', () => {
    const plan = planModuleRegistry({ manifest: { name: 'unified-inbox' }, coreRegistry })

    expect(plan.modules.map((m) => m.name)).toEqual(['unified-inbox'])
  })

  // A module still in review is not in core's registry yet; the gate must still run.
  it('falls back to the repo it is running in for a module core has not learned', () => {
    const plan = planModuleRegistry({
      manifest: { name: 'brand-new' },
      coreRegistry,
      candidateRepoUrl: 'https://github.com/cactus-foundation-modules/brand-new',
    })

    expect(plan.modules[0]?.repoUrl).toBe('https://github.com/cactus-foundation-modules/brand-new')
  })

  it('refuses a requiresModules name core has never heard of, and names it', () => {
    expect(() =>
      planModuleRegistry({
        manifest: { name: 'unified-inbox', requiresModules: [{ name: 'typo-for-shop' }] },
        coreRegistry,
      })
    ).toThrow(/typo-for-shop/)
  })

  it('refuses a manifest with no name', () => {
    expect(() => planModuleRegistry({ manifest: {}, coreRegistry })).toThrow(/name/)
  })
})
