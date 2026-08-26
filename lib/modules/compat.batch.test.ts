import { describe, it, expect } from 'vitest'
import { resolveUpdateBatch, type UpdateCandidate, type ModuleRequirements } from './compat'
import type { InstalledModuleVersion } from './dependencies'

const CORE = '0.5.1310'

function candidate(
  name: string,
  tag: string,
  requirements: ModuleRequirements | null = { requiresModules: [] }
): UpdateCandidate<{ name: string }> {
  return { module: { name }, name, tag, requirements }
}

function active(name: string, version: string): InstalledModuleVersion {
  return { name, version, status: 'active' }
}

describe('resolveUpdateBatch', () => {
  // The 2026-08-25 Deskwell case, exactly. Three modules showed an update and
  // "Update all" shipped one: shop-variations 0.1.169 declares shop >= 0.1.336
  // and product-addons 0.1.31 declares both, so judged against the site's
  // pre-batch state (shop 0.1.335) each was rejected for a prerequisite the same
  // batch was about to pin. The owner clicked twice more and got three stacked
  // builds for what is one commit's worth of work.
  it('lets a batch satisfy its own dependency chain', () => {
    const installed = [
      active('shop', 'v0.1.335'),
      active('shop-variations', 'v0.1.168'),
      active('product-addons-for-shop', 'v0.1.30'),
    ]
    // Deliberately the least helpful order: every dependant before its dependency.
    const candidates = [
      candidate('product-addons-for-shop', 'v0.1.31', {
        requiresModules: [
          { name: 'shop', minVersion: '0.1.336' },
          { name: 'shop-variations', minVersion: '0.1.169' },
        ],
      }),
      candidate('shop-variations', 'v0.1.169', {
        requiresModules: [{ name: 'shop', minVersion: '0.1.336' }],
      }),
      candidate('shop', 'v0.1.336', { requiresModules: [] }),
    ]

    const { accepted, blocked } = resolveUpdateBatch({ candidates, coreVersion: CORE, installed })

    expect(blocked).toEqual([])
    expect(accepted.map((c) => c.name).sort()).toEqual([
      'product-addons-for-shop',
      'shop',
      'shop-variations',
    ])
  })

  // The gate still has to bite. A dependency nothing in the batch supplies is a
  // module that would break the next build on a missing import.
  it('blocks a module whose dependency the batch cannot supply', () => {
    const installed = [active('shop', 'v0.1.335'), active('filters-for-shop', 'v0.1.43')]
    const candidates = [
      candidate('filters-for-shop', 'v0.1.44', {
        requiresModules: [{ name: 'shop', minVersion: '0.1.400' }],
      }),
    ]

    const { accepted, blocked } = resolveUpdateBatch({ candidates, coreVersion: CORE, installed })

    expect(accepted).toEqual([])
    expect(blocked).toHaveLength(1)
    expect(blocked[0]?.reason).toContain('"shop"')
    expect(blocked[0]?.reason).toContain('0.1.400')
  })

  it('blocks on core version without touching the rest of the batch', () => {
    const installed = [active('shop', 'v0.1.335'), active('gazette', 'v0.1.25')]
    const candidates = [
      candidate('gazette', 'v0.1.26', { requiresCoreVersion: '0.9.0', requiresModules: [] }),
      candidate('shop', 'v0.1.336', { requiresModules: [] }),
    ]

    const { accepted, blocked } = resolveUpdateBatch({ candidates, coreVersion: CORE, installed })

    expect(accepted.map((c) => c.name)).toEqual(['shop'])
    expect(blocked.map((b) => b.candidate.name)).toEqual(['gazette'])
    expect(blocked[0]?.reason).toContain('Cactus v0.9.0')
  })

  // A blocked link must not take the ones behind it down with it, and the
  // rounds must terminate rather than spin on a pair that can never resolve.
  it('accepts what it can and reports the rest, on a partially blocked chain', () => {
    const installed = [
      active('shop', 'v0.1.335'),
      active('shop-variations', 'v0.1.168'),
      active('product-addons-for-shop', 'v0.1.30'),
    ]
    const candidates = [
      candidate('shop', 'v0.1.336', { requiresModules: [] }),
      // Wants a shop-variations release that is not in this batch at all.
      candidate('product-addons-for-shop', 'v0.1.31', {
        requiresModules: [{ name: 'shop-variations', minVersion: '0.1.170' }],
      }),
    ]

    const { accepted, blocked } = resolveUpdateBatch({ candidates, coreVersion: CORE, installed })

    expect(accepted.map((c) => c.name)).toEqual(['shop'])
    expect(blocked.map((b) => b.candidate.name)).toEqual(['product-addons-for-shop'])
  })

  // A manifest that could not be read is "no opinion", not "refuse" - a GitHub
  // hiccup must not strand an otherwise-fine update.
  it('lets an unreadable manifest through', () => {
    const { accepted, blocked } = resolveUpdateBatch({
      candidates: [candidate('twilio', 'v0.1.30', null)],
      coreVersion: CORE,
      installed: [active('twilio', 'v0.1.29')],
    })

    expect(blocked).toEqual([])
    expect(accepted.map((c) => c.name)).toEqual(['twilio'])
  })

  it('handles an empty batch', () => {
    expect(resolveUpdateBatch({ candidates: [], coreVersion: CORE, installed: [] })).toEqual({
      accepted: [],
      blocked: [],
    })
  })
})
