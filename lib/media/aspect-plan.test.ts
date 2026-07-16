import { describe, it, expect } from 'vitest'
import { planAspectChange, ratioLabel, MAX_ASPECT_PIXELS } from './aspect-plan'

// The promise this feature makes is "no trimming, no stretching". Both are
// properties of the arithmetic, so both get asserted directly rather than eyeballed.
function assertKeepsEveryPixel(src: [number, number], plan: NonNullable<ReturnType<typeof planAspectChange>>) {
  const [w, h] = src
  // Nothing is cut off: the drawn image never exceeds the canvas.
  expect(plan.imageWidth).toBeLessThanOrEqual(plan.canvasWidth)
  expect(plan.imageHeight).toBeLessThanOrEqual(plan.canvasHeight)
  // Nothing is squashed: the drawn image keeps the source's own ratio.
  expect(plan.imageWidth / plan.imageHeight).toBeCloseTo(w / h, 1)
  // Padding accounts for exactly the leftover space.
  expect(plan.padLeft + plan.imageWidth + plan.padRight).toBe(plan.canvasWidth)
  expect(plan.padTop + plan.imageHeight + plan.padBottom).toBe(plan.canvasHeight)
}

describe('planAspectChange', () => {
  it('pads top and bottom when the source is wider than the target', () => {
    const plan = planAspectChange(1600, 900, 1, 1)!
    expect(plan.canvasWidth).toBe(1600)
    expect(plan.canvasHeight).toBe(1600)
    expect(plan.imageWidth).toBe(1600)
    expect(plan.imageHeight).toBe(900)
    expect(plan.padTop).toBe(350)
    expect(plan.padBottom).toBe(350)
    expect(plan.padLeft).toBe(0)
    expect(plan.padRight).toBe(0)
    assertKeepsEveryPixel([1600, 900], plan)
  })

  it('pads left and right when the source is taller than the target', () => {
    const plan = planAspectChange(900, 1600, 1, 1)!
    expect(plan.canvasWidth).toBe(1600)
    expect(plan.canvasHeight).toBe(1600)
    expect(plan.padLeft).toBe(350)
    expect(plan.padRight).toBe(350)
    expect(plan.padTop).toBe(0)
    assertKeepsEveryPixel([900, 1600], plan)
  })

  it('never downscales the source for an ordinary ratio change', () => {
    const plan = planAspectChange(1200, 800, 16, 9)!
    expect(plan.imageWidth).toBe(1200)
    expect(plan.imageHeight).toBe(800)
    expect(plan.downscaled).toBe(false)
    expect(plan.canvasWidth / plan.canvasHeight).toBeCloseTo(16 / 9, 2)
  })

  it('returns null when the image already has the requested ratio', () => {
    expect(planAspectChange(1920, 1080, 16, 9)).toBeNull()
    expect(planAspectChange(800, 800, 1, 1)).toBeNull()
    expect(planAspectChange(600, 400, 3, 2)).toBeNull()
  })

  it('treats an equivalent ratio the same as its reduced form', () => {
    expect(planAspectChange(1920, 1080, 32, 18)).toBeNull()
    const a = planAspectChange(1000, 1000, 16, 9)!
    const b = planAspectChange(1000, 1000, 32, 18)!
    expect(a).toEqual(b)
  })

  it('lands the canvas on the requested ratio', () => {
    const cases: [number, number][] = [[1, 1], [4, 3], [3, 4], [16, 9], [9, 16], [3, 2], [2, 3]]
    for (const [rw, rh] of cases) {
      const plan = planAspectChange(1333, 777, rw, rh)!
      expect(plan.canvasWidth / plan.canvasHeight).toBeCloseTo(rw / rh, 2)
      assertKeepsEveryPixel([1333, 777], plan)
    }
  })

  it('accepts a custom non-integer ratio', () => {
    const plan = planAspectChange(1000, 1000, 2.35, 1)!
    expect(plan.canvasWidth / plan.canvasHeight).toBeCloseTo(2.35, 2)
    expect(plan.canvasHeight).toBe(1000)
    assertKeepsEveryPixel([1000, 1000], plan)
  })

  it('scales the whole plan down uniformly rather than exceed the pixel cap', () => {
    // A wide panorama forced to 9:16 wants a vast canvas of mostly padding.
    const plan = planAspectChange(6000, 1000, 9, 16)!
    expect(plan.downscaled).toBe(true)
    expect(plan.canvasWidth * plan.canvasHeight).toBeLessThanOrEqual(MAX_ASPECT_PIXELS)
    expect(plan.canvasWidth / plan.canvasHeight).toBeCloseTo(9 / 16, 2)
    // Still a uniform scale of the source, so nothing is trimmed or stretched.
    assertKeepsEveryPixel([6000, 1000], plan)
    expect(plan.imageWidth).toBeLessThan(6000)
  })

  it('honours a caller-supplied pixel cap', () => {
    const plan = planAspectChange(2000, 1000, 1, 1, 1_000_000)!
    expect(plan.canvasWidth * plan.canvasHeight).toBeLessThanOrEqual(1_000_000)
    expect(plan.downscaled).toBe(true)
    assertKeepsEveryPixel([2000, 1000], plan)
  })

  it('handles a one-pixel-off source without producing a negative pad', () => {
    const plan = planAspectChange(1001, 1000, 1, 1)!
    expect(plan.padLeft).toBeGreaterThanOrEqual(0)
    expect(plan.padRight).toBeGreaterThanOrEqual(0)
    expect(plan.padTop).toBeGreaterThanOrEqual(0)
    expect(plan.padBottom).toBeGreaterThanOrEqual(0)
    assertKeepsEveryPixel([1001, 1000], plan)
  })

  it('rejects nonsense input rather than guess', () => {
    expect(() => planAspectChange(0, 100, 1, 1)).toThrow()
    expect(() => planAspectChange(100, 100, 0, 1)).toThrow()
    expect(() => planAspectChange(100, 100, 1, -2)).toThrow()
    expect(() => planAspectChange(100, 100, NaN, 1)).toThrow()
  })
})

describe('ratioLabel', () => {
  it('reads like the preset the user picked', () => {
    expect(ratioLabel(16, 9)).toBe('16:9')
    expect(ratioLabel(1, 1)).toBe('1:1')
    expect(ratioLabel(2.35, 1)).toBe('2.35:1')
  })
})
