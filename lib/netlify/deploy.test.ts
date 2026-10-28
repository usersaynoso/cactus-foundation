import { describe, it, expect } from 'vitest'
import { netlifyStateToNormalised } from './deploy'

describe('netlifyStateToNormalised', () => {
  it('maps terminal states', () => {
    expect(netlifyStateToNormalised('ready')).toBe('READY')
    expect(netlifyStateToNormalised('error')).toBe('ERROR')
    expect(netlifyStateToNormalised('rejected')).toBe('ERROR')
    expect(netlifyStateToNormalised('cancelled')).toBe('CANCELED')
  })

  it('treats every other known state as still building', () => {
    for (const state of ['new', 'enqueued', 'building', 'uploading', 'processing', 'pending_review']) {
      expect(netlifyStateToNormalised(state)).toBe('BUILDING')
    }
  })

  it('is UNKNOWN with no state at all', () => {
    expect(netlifyStateToNormalised(undefined)).toBe('UNKNOWN')
  })
})
