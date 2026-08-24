import { describe, it, expect } from 'vitest'
import { scaleToFitMetrics } from '@/lib/puck/scaleToFit'

describe('scaleToFitMetrics', () => {
  it('shrinks contents that are wider than the column', () => {
    // Deskwell's header logo: a 366.7px lockup in a 253px column.
    const m = scaleToFitMetrics(253, 366.7, 56)
    expect(m).not.toBeNull()
    expect(m!.scale).toBeCloseTo(0.69, 2)
    expect(m!.boxHeight).toBeCloseTo(56 * m!.scale, 5)
  })

  it('never enlarges contents that already fit', () => {
    expect(scaleToFitMetrics(400, 120, 40)).toEqual({ scale: 1, boxHeight: 40 })
  })

  // The whole reason this is a separate function. A recorded zero pins the scale
  // at 1 and collapses the box, and the contents then spill out of the column
  // for good rather than for a frame.
  it('discards a measurement taken with no room to measure into', () => {
    expect(scaleToFitMetrics(0, 366.7, 56)).toBeNull()
  })

  it('discards a measurement of contents that have no box yet', () => {
    expect(scaleToFitMetrics(253, 0, 0)).toBeNull()
    expect(scaleToFitMetrics(253, 366.7, 0)).toBeNull()
    expect(scaleToFitMetrics(253, 0, 56)).toBeNull()
  })

  it('discards nonsense rather than propagating it', () => {
    expect(scaleToFitMetrics(-10, 100, 20)).toBeNull()
    expect(scaleToFitMetrics(NaN, 100, 20)).toBeNull()
    expect(scaleToFitMetrics(253, NaN, 20)).toBeNull()
  })
})
