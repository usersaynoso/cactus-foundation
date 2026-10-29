import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/notifications/deployment', () => ({ recordDeploymentNeeded: vi.fn() }))

import { manualDeployMarker, manualDeploySince, pickManualDeploy } from './manual'

describe('manual-deploy marker', () => {
  it('round-trips the commit time', () => {
    expect(manualDeploySince(manualDeployMarker(1_700_000_000_000))).toBe(1_700_000_000_000)
  })

  it('ignores real deployment ids and the pending sentinel', () => {
    expect(manualDeploySince('dpl_abc')).toBeNull()
    expect(manualDeploySince('pending')).toBeNull()
    expect(manualDeploySince(null)).toBeNull()
  })
})

describe('pickManualDeploy', () => {
  const since = 1_000

  it('settles on the owner\'s deploy made after the commit', () => {
    const hit = pickManualDeploy([{ id: 'cli', createdAt: 2_000, state: 'READY' }], since)
    expect(hit?.id).toBe('cli')
  })

  // A replay rebuilds an older upload's files: READY on the old code. Exactly the
  // false success this whole path exists to stop.
  it('never settles on a replay', () => {
    const hit = pickManualDeploy([{ id: 'replay', createdAt: 2_000, state: 'READY', isReplay: true }], since)
    expect(hit).toBeNull()
  })

  it('looks past a replay to the real deploy under it', () => {
    const hit = pickManualDeploy(
      [
        { id: 'replay', createdAt: 3_000, state: 'READY', isReplay: true },
        { id: 'cli', createdAt: 2_000, state: 'BUILDING' },
      ],
      since
    )
    expect(hit?.id).toBe('cli')
  })

  it('ignores anything from before the commit', () => {
    expect(pickManualDeploy([{ id: 'old', createdAt: 500, state: 'READY' }], since)).toBeNull()
  })
})
