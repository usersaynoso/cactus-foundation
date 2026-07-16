import { describe, it, expect } from 'vitest'
import {
  planPinCheck,
  isPinCheckClean,
  formatPinCheckReport,
  manifestKey,
  type ModuleManifestFacts,
  type RegistryEntry,
} from './pin-check'

// These tests are pure: no network, no gh, no skip. The live check in
// pin-check.live.test.ts can only run where gh is authed, so the resolution logic has to
// be provable without it - otherwise the only thing standing between the registry and a
// broken build is a check that silently skips in CI.

const CORE_VERSION = '0.5.459'

function manifests(...facts: ModuleManifestFacts[]): Map<string, ModuleManifestFacts> {
  return new Map(facts.map((m) => [manifestKey(m.name, m.version), m]))
}

function latest(pairs: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(pairs))
}

const SHOP_0_1_28: ModuleManifestFacts = { name: 'shop', version: '0.1.28' }
const SHOP_0_1_39: ModuleManifestFacts = { name: 'shop', version: '0.1.39' }
const VARIATIONS_0_1_7: ModuleManifestFacts = {
  name: 'shop-variations',
  version: '0.1.7',
  requiresCoreVersion: '0.5.426',
  requiresModules: [{ name: 'shop', minVersion: '0.1.38' }],
}

describe('planPinCheck - staleness', () => {
  it('flags a pin behind its latest release', () => {
    const entries: RegistryEntry[] = [{ name: 'shop', version: 'v0.1.28' }]
    const plan = planPinCheck({
      entries,
      latestByName: latest({ shop: 'v0.1.39' }),
      manifests: manifests(SHOP_0_1_28, SHOP_0_1_39),
      coreVersion: CORE_VERSION,
    })

    expect(plan.lagging).toEqual([{ name: 'shop', pinned: '0.1.28', latest: '0.1.39' }])
    expect(isPinCheckClean(plan)).toBe(false)
  })

  it('is clean when every pin matches its latest release', () => {
    const plan = planPinCheck({
      entries: [{ name: 'shop', version: 'v0.1.39' }],
      latestByName: latest({ shop: 'v0.1.39' }),
      manifests: manifests(SHOP_0_1_39),
      coreVersion: CORE_VERSION,
    })

    expect(plan.lagging).toEqual([])
    expect(isPinCheckClean(plan)).toBe(true)
    expect(formatPinCheckReport(plan)).toContain('matches its latest release')
  })

  it('never reports a pin AHEAD of the latest release as lag', () => {
    // A tag pushed without a GitHub release: unusual, but not the rot this catches.
    const plan = planPinCheck({
      entries: [{ name: 'shop', version: 'v0.1.39' }],
      latestByName: latest({ shop: 'v0.1.28' }),
      manifests: manifests(SHOP_0_1_39),
      coreVersion: CORE_VERSION,
    })

    expect(plan.lagging).toEqual([])
  })

  it('flags an entry with no version pin, since the build takes HEAD', () => {
    const plan = planPinCheck({
      entries: [{ name: 'shop' }],
      latestByName: latest({ shop: 'v0.1.39' }),
      manifests: manifests(SHOP_0_1_39),
      coreVersion: CORE_VERSION,
    })

    expect(plan.unpinned).toEqual(['shop'])
    expect(isPinCheckClean(plan)).toBe(false)
  })
})

describe('planPinCheck - the requiresModules trap', () => {
  // The v0.5.459 situation, exactly: bumping shop-variations to 0.1.7 while shop stays
  // pinned at v0.1.28 clones a shop with no product-editor/context and fails the build.
  it('catches a dependent bumped while its base pin stays behind', () => {
    const plan = planPinCheck({
      entries: [
        { name: 'shop', version: 'v0.1.28' },
        { name: 'shop-variations', version: 'v0.1.7' },
      ],
      latestByName: latest({ shop: 'v0.1.28', 'shop-variations': 'v0.1.7' }),
      manifests: manifests(SHOP_0_1_28, VARIATIONS_0_1_7),
      coreVersion: CORE_VERSION,
    })

    // Nothing lags - every pin is at its latest release - and the set is still broken.
    // Per-module staleness alone would call this clean.
    expect(plan.lagging).toEqual([])
    expect(plan.currentProblems).toEqual([
      {
        name: 'shop-variations',
        version: '0.1.7',
        unmetModules: [
          { name: 'shop', minVersion: '0.1.38', reason: 'outdated', installedVersion: '0.1.28' },
        ],
        unmetCore: undefined,
      },
    ])
    expect(isPinCheckClean(plan)).toBe(false)
    expect(formatPinCheckReport(plan)).toContain('needs shop >= v0.1.38 (set has v0.1.28)')
  })

  it('accepts the set when the base pin moves with the dependent', () => {
    const plan = planPinCheck({
      entries: [
        { name: 'shop', version: 'v0.1.39' },
        { name: 'shop-variations', version: 'v0.1.7' },
      ],
      latestByName: latest({ shop: 'v0.1.39', 'shop-variations': 'v0.1.7' }),
      manifests: manifests(SHOP_0_1_39, VARIATIONS_0_1_7),
      coreVersion: CORE_VERSION,
    })

    expect(plan.currentProblems).toEqual([])
    expect(plan.proposedProblems).toEqual([])
    expect(isPinCheckClean(plan)).toBe(true)
  })

  it('judges the PROPOSED set against the proposed tag manifest, not the pinned one', () => {
    // 0.1.7 needs shop >= 0.1.38; 0.1.9 raises that to >= 0.1.45, which no release
    // satisfies. The lag is real but the bump can't be applied on its own.
    const variations_0_1_9: ModuleManifestFacts = {
      name: 'shop-variations',
      version: '0.1.9',
      requiresModules: [{ name: 'shop', minVersion: '0.1.45' }],
    }
    const plan = planPinCheck({
      entries: [
        { name: 'shop', version: 'v0.1.39' },
        { name: 'shop-variations', version: 'v0.1.7' },
      ],
      latestByName: latest({ shop: 'v0.1.39', 'shop-variations': 'v0.1.9' }),
      manifests: manifests(SHOP_0_1_39, VARIATIONS_0_1_7, variations_0_1_9),
      coreVersion: CORE_VERSION,
    })

    expect(plan.currentProblems).toEqual([])
    expect(plan.lagging).toEqual([{ name: 'shop-variations', pinned: '0.1.7', latest: '0.1.9' }])
    expect(plan.proposedProblems).toEqual([
      {
        name: 'shop-variations',
        version: '0.1.9',
        unmetModules: [
          { name: 'shop', minVersion: '0.1.45', reason: 'outdated', installedVersion: '0.1.39' },
        ],
        unmetCore: undefined,
      },
    ])
    expect(formatPinCheckReport(plan)).toContain('would NOT resolve')
  })

  it('reports a required module absent from the registry as missing', () => {
    const plan = planPinCheck({
      entries: [{ name: 'shop-variations', version: 'v0.1.7' }],
      latestByName: latest({ 'shop-variations': 'v0.1.7' }),
      manifests: manifests(VARIATIONS_0_1_7),
      coreVersion: CORE_VERSION,
    })

    expect(plan.currentProblems).toEqual([
      {
        name: 'shop-variations',
        version: '0.1.7',
        unmetModules: [{ name: 'shop', minVersion: '0.1.38', reason: 'missing' }],
        unmetCore: undefined,
      },
    ])
    expect(formatPinCheckReport(plan)).toContain('not in the registry')
  })
})

describe('planPinCheck - requiresCoreVersion', () => {
  it('flags a module needing a core newer than this one', () => {
    const plan = planPinCheck({
      entries: [{ name: 'shop-variations', version: 'v0.1.7' }, { name: 'shop', version: 'v0.1.39' }],
      latestByName: latest({ 'shop-variations': 'v0.1.7', shop: 'v0.1.39' }),
      manifests: manifests(VARIATIONS_0_1_7, SHOP_0_1_39),
      coreVersion: '0.5.400',
    })

    expect(plan.currentProblems).toEqual([
      {
        name: 'shop-variations',
        version: '0.1.7',
        unmetModules: [],
        unmetCore: { required: '0.5.426', coreVersion: '0.5.400' },
      },
    ])
    expect(formatPinCheckReport(plan)).toContain('needs core >= v0.5.426 (core is v0.5.400)')
  })

  it('accepts a core exactly at the required version', () => {
    const plan = planPinCheck({
      entries: [{ name: 'shop-variations', version: 'v0.1.7' }, { name: 'shop', version: 'v0.1.39' }],
      latestByName: latest({ 'shop-variations': 'v0.1.7', shop: 'v0.1.39' }),
      manifests: manifests(VARIATIONS_0_1_7, SHOP_0_1_39),
      coreVersion: '0.5.426',
    })

    expect(plan.currentProblems).toEqual([])
  })
})

describe('planPinCheck - unread manifests', () => {
  it('reports an unread manifest rather than assuming it has no dependencies', () => {
    const plan = planPinCheck({
      entries: [{ name: 'shop', version: 'v0.1.39' }],
      latestByName: latest({ shop: 'v0.1.39' }),
      manifests: manifests(),
      coreVersion: CORE_VERSION,
    })

    expect(plan.unknownManifests).toEqual(['shop@0.1.39'])
    expect(isPinCheckClean(plan)).toBe(false)
    expect(formatPinCheckReport(plan)).toContain('could not be read')
  })
})
