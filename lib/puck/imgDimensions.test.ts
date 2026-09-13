import { describe, it, expect } from 'vitest'
import { imgDimensionAttrs } from './imgDimensions'

// Width and height are only ever a reservation, so the cases that matter are the
// ones where the answer must be NOTHING: no metadata (the editor canvas), a url the
// library does not know, and a size that is not a real one. Each of those has to
// render exactly as the block did before sizes existed.
const URL = 'https://media.example.com/hero.webp'

describe('imgDimensionAttrs', () => {
  it('gives the recorded size when the render knows it', () => {
    expect(imgDimensionAttrs({ metadata: { mediaDimensions: { [URL]: { width: 800, height: 450 } } } }, URL)).toEqual({
      width: 800,
      height: 450,
    })
  })

  it('gives nothing when no metadata reached the block', () => {
    expect(imgDimensionAttrs(undefined, URL)).toEqual({})
    expect(imgDimensionAttrs({}, URL)).toEqual({})
    expect(imgDimensionAttrs({ metadata: {} }, URL)).toEqual({})
  })

  it('gives nothing for a picture the map does not name', () => {
    expect(imgDimensionAttrs({ metadata: { mediaDimensions: { [URL]: { width: 800, height: 450 } } } }, `${URL}?v=2`)).toEqual({})
  })

  it('gives nothing for a size that is not a real one', () => {
    for (const bad of [{ width: 0, height: 450 }, { width: 800, height: -1 }, { width: 800.5, height: 450 }, { width: Number.NaN, height: 450 }]) {
      expect(imgDimensionAttrs({ metadata: { mediaDimensions: { [URL]: bad } } }, URL)).toEqual({})
    }
  })
})
