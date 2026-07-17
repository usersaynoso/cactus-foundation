import { describe, it, expect } from 'vitest'
import { planResize, sizeLabel, MAX_RESIZE_PIXELS } from './resize-plan'

// The promise this feature makes is "a uniform scale, never an upscale". Both
// are properties of the arithmetic, so both get asserted directly.
function assertUniformScale(src: [number, number], plan: NonNullable<ReturnType<typeof planResize>>) {
  const [w, h] = src
  // Nothing is squashed: the output keeps the source's own ratio.
  expect(plan.width / plan.height).toBeCloseTo(w / h, 1)
  // Nothing is invented: a resize only ever shrinks.
  expect(plan.width).toBeLessThanOrEqual(w)
  expect(plan.height).toBeLessThanOrEqual(h)
}

describe('planResize', () => {
  it('scales to a max width, keeping the ratio', () => {
    const plan = planResize(4000, 3000, { width: 2000 })!
    expect(plan.width).toBe(2000)
    expect(plan.height).toBe(1500)
    expect(plan.capped).toBe(false)
    assertUniformScale([4000, 3000], plan)
  })

  it('scales to a max height, keeping the ratio', () => {
    const plan = planResize(4000, 3000, { height: 600 })!
    expect(plan.height).toBe(600)
    expect(plan.width).toBe(800)
    assertUniformScale([4000, 3000], plan)
  })

  it('fits inside a box, letting the tighter side win', () => {
    // Width alone would allow 2000x1500; height 500 is the tighter constraint.
    const plan = planResize(4000, 3000, { width: 2000, height: 500 })!
    expect(plan.height).toBe(500)
    expect(plan.width).toBe(667)
    assertUniformScale([4000, 3000], plan)
  })

  it('never enlarges an image that already fits', () => {
    expect(planResize(800, 600, { width: 2000 })).toBeNull()
    expect(planResize(800, 600, { height: 4000 })).toBeNull()
    expect(planResize(800, 600, { width: 2000, height: 4000 })).toBeNull()
  })

  it('returns null when the box is exactly the source size', () => {
    expect(planResize(1920, 1080, { width: 1920 })).toBeNull()
    expect(planResize(1920, 1080, { width: 1920, height: 1080 })).toBeNull()
  })

  it('shrinks by one pixel when asked to, rather than call it a no-op', () => {
    const plan = planResize(1920, 1080, { width: 1919 })!
    expect(plan.width).toBe(1919)
    assertUniformScale([1920, 1080], plan)
  })

  it('keeps a portrait image portrait', () => {
    const plan = planResize(1000, 2000, { width: 500 })!
    expect(plan.width).toBe(500)
    expect(plan.height).toBe(1000)
    assertUniformScale([1000, 2000], plan)
  })

  it('never rounds a side away to zero', () => {
    const plan = planResize(4000, 10, { width: 20 })!
    expect(plan.width).toBeGreaterThanOrEqual(1)
    expect(plan.height).toBeGreaterThanOrEqual(1)
  })

  it('scales down uniformly rather than exceed the pixel cap', () => {
    // A vast source with a box far larger than the cap allows.
    const plan = planResize(20000, 10000, { width: 20000 }, 1_000_000)!
    expect(plan.capped).toBe(true)
    expect(plan.width * plan.height).toBeLessThanOrEqual(1_000_000)
    assertUniformScale([20000, 10000], plan)
  })

  it('leaves an ordinary resize uncapped', () => {
    const plan = planResize(4000, 3000, { width: 1200 })!
    expect(plan.capped).toBe(false)
    expect(plan.width * plan.height).toBeLessThanOrEqual(MAX_RESIZE_PIXELS)
  })

  it('rejects nonsense input rather than guess', () => {
    expect(() => planResize(0, 100, { width: 50 })).toThrow()
    expect(() => planResize(100, 100, {})).toThrow()
    expect(() => planResize(100, 100, { width: 0 })).toThrow()
    expect(() => planResize(100, 100, { width: -5 })).toThrow()
    expect(() => planResize(100, 100, { width: NaN })).toThrow()
  })
})

describe('sizeLabel', () => {
  it('reads like the size the user asked for', () => {
    expect(sizeLabel(1920, 1080)).toBe('1920x1080')
    expect(sizeLabel(800.4, 600.6)).toBe('800x601')
  })
})
