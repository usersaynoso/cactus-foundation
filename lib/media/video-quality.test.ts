import { describe, it, expect } from 'vitest'
import {
  DEFAULT_VIDEO_MAX_WIDTH,
  DEFAULT_VIDEO_QUALITY,
  VIDEO_QUALITY_LEVELS,
  VIDEO_WIDTH_CHOICES,
  crfForQuality,
  isVideoQualityLevel,
  keyStaysPut,
  optimisedVideoKey,
} from './video-quality'

// The two halves of the video optimiser read this table: the dialog offers the
// choice, the enqueue route validates what comes back. These are the facts both
// of them depend on being true.

describe('video quality ladder', () => {
  it('maps each level to its CRF, and anything unknown to the default', () => {
    expect(crfForQuality('high')).toBe(20)
    expect(crfForQuality('balanced')).toBe(23)
    expect(crfForQuality('small')).toBe(26)
    // The route falls back to the default level for an unrecognised body value,
    // so the default must always resolve to a number rather than undefined.
    expect(crfForQuality(DEFAULT_VIDEO_QUALITY)).toBe(23)
  })

  it('gets better as the CRF gets lower, in the order it is offered', () => {
    const crfs = VIDEO_QUALITY_LEVELS.map((q) => q.crf)
    expect(crfs).toEqual([...crfs].sort((a, b) => a - b))
    // Outside 16-32 the worker clamps, which would silently mean something
    // other than what the label promises.
    for (const q of VIDEO_QUALITY_LEVELS) {
      expect(q.crf).toBeGreaterThanOrEqual(16)
      expect(q.crf).toBeLessThanOrEqual(32)
    }
  })

  it('recognises only the levels it offers', () => {
    for (const q of VIDEO_QUALITY_LEVELS) expect(isVideoQualityLevel(q.id)).toBe(true)
    for (const bad of ['best', '', 'BALANCED', 23, null, undefined]) {
      expect(isVideoQualityLevel(bad)).toBe(false)
    }
  })

  it('offers the default width among the choices', () => {
    expect(VIDEO_WIDTH_CHOICES).toContain(DEFAULT_VIDEO_MAX_WIDTH)
    // Descending, so the safest (largest) option reads first in the dropdown.
    expect([...VIDEO_WIDTH_CHOICES]).toEqual([...VIDEO_WIDTH_CHOICES].sort((a, b) => b - a))
  })
})

describe('where the optimised file lands', () => {
  it('writes an MP4 back over its own key', () => {
    const key = 'media/shop/office-seating/eclipse/demo.mp4'
    expect(optimisedVideoKey(key)).toBe(key)
    expect(keyStaysPut(key)).toBe(true)
  })

  it('re-extensions a WebM, because the bytes really are MP4 afterwards', () => {
    expect(optimisedVideoKey('media/promo/clip.webm')).toBe('media/promo/clip.mp4')
    expect(keyStaysPut('media/promo/clip.webm')).toBe(false)
  })

  it('leaves dots in folder names alone', () => {
    // Only the final extension may move. A key whose folders carry dots (a
    // product slug like "chiro-2.0") must not be truncated at the first one.
    expect(optimisedVideoKey('media/shop/chiro-2.0/height.webm')).toBe('media/shop/chiro-2.0/height.mp4')
    expect(optimisedVideoKey('media/shop/chiro-2.0/height.mp4')).toBe('media/shop/chiro-2.0/height.mp4')
  })
})
