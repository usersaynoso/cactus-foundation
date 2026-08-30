import { describe, it, expect } from 'vitest'
import { trackedIdForSettle } from './settle-target'

describe('trackedIdForSettle', () => {
  it('prefers a real deployment id carried by the module rows', () => {
    const rows = [{ deployId: null }, { deployId: 'dpl_real' }]

    expect(trackedIdForSettle(rows, 'dpl_marker')).toBe('dpl_real')
  })

  // 'pending' is the placeholder written before startDeferredRedeploy learns the
  // real id, so it names no deployment and must not beat the site marker.
  it('ignores the pending placeholder', () => {
    const rows = [{ deployId: 'pending' }]

    expect(trackedIdForSettle(rows, 'dpl_marker')).toBe('dpl_marker')
  })

  it('falls back to the site marker for rows queued by an older build', () => {
    const rows = [{ deployId: null }]

    expect(trackedIdForSettle(rows, 'dpl_marker')).toBe('dpl_marker')
  })

  // No id anywhere means deploymentStatusForReconcile is asked without one, and it
  // answers UNKNOWN rather than about a stranger's build - so nothing is settled.
  it('offers nothing when neither side names a deployment', () => {
    expect(trackedIdForSettle([{ deployId: null }], null)).toBeNull()
  })
})
