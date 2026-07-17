import { describe, it, expect } from 'vitest'
import { imgLoading } from './imgLoading'

// The setting's whole job is deciding one attribute, so the decision gets pinned
// down here rather than eyeballed in a browser. The important cases are the ones
// where metadata is absent: those must stay lazy, because that is how every one
// of these blocks behaved before the setting existed.
describe('imgLoading', () => {
  it('is lazy when the site has the setting on', () => {
    expect(imgLoading({ metadata: { lazyImages: true } })).toBe('lazy')
  })

  it('is eager when the site has the setting off', () => {
    expect(imgLoading({ metadata: { lazyImages: false } })).toBe('eager')
  })

  it('falls back to lazy when no metadata reached the block', () => {
    // The Puck editor canvas is handed no metadata at all.
    expect(imgLoading({})).toBe('lazy')
    expect(imgLoading({ metadata: {} })).toBe('lazy')
    expect(imgLoading(undefined)).toBe('lazy')
  })

  it('only ever treats an explicit false as off', () => {
    // Guards the === false: a missing or undefined value is not "off".
    expect(imgLoading({ metadata: { lazyImages: undefined } })).toBe('lazy')
  })
})
