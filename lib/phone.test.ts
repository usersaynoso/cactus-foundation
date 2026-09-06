import { describe, it, expect } from 'vitest'
import { isE164, toE164 } from './phone'

const GB = '+44'

describe('toE164', () => {
  it('leaves a number that is already international alone', () => {
    expect(toE164('+442081380512', GB)).toBe('+442081380512')
    expect(toE164('+44 20 8138 0512', GB)).toBe('+442081380512')
    expect(toE164('+1 (415) 555-2671', GB)).toBe('+14155552671')
  })

  it('reads the 00 form of an international number', () => {
    expect(toE164('00442081380512', GB)).toBe('+442081380512')
    expect(toE164('0044 20 8138 0512', GB)).toBe('+442081380512')
  })

  it('drops a trunk zero and adds the site dialling code', () => {
    expect(toE164('02081380512', GB)).toBe('+442081380512')
    expect(toE164('020 8138 0512', GB)).toBe('+442081380512')
    expect(toE164('07700 900123', GB)).toBe('+447700900123')
  })

  it('adds the site dialling code to a bare national number', () => {
    expect(toE164('2081380512', GB)).toBe('+442081380512')
    expect(toE164('7700900123', GB)).toBe('+447700900123')
  })

  it('takes bare digits that already carry the dialling code as international', () => {
    expect(toE164('447700900123', GB)).toBe('+447700900123')
    expect(toE164('442081380512', GB)).toBe('+442081380512')
  })

  it('ignores the punctuation people type into a phone number', () => {
    expect(toE164('(0208) 138.0512', GB)).toBe('+442081380512')
    expect(toE164(' 020–8138–0512 ', GB)).toBe('+442081380512')
  })

  it('accepts the dialling code however it was saved', () => {
    expect(toE164('02081380512', '44')).toBe('+442081380512')
    expect(toE164('02081380512', '0044')).toBe('+442081380512')
    expect(toE164('02081380512', '+44 ')).toBe('+442081380512')
  })

  it('honours a dialling code that is not this platform default', () => {
    expect(toE164('0612345678', '+33')).toBe('+33612345678')
    expect(toE164('4155552671', '+1')).toBe('+14155552671')
  })

  it('refuses anything it cannot read as a number', () => {
    expect(toE164('', GB)).toBeNull()
    expect(toE164('not a number', GB)).toBeNull()
    expect(toE164('12345', GB)).toBeNull()
    expect(toE164('020 8138 0512 ext 4', GB)).toBeNull()
    expect(toE164('+0442081380512', GB)).toBeNull()
    expect(toE164('+4420813805121234567890', GB)).toBeNull()
  })

  it('can still read a full number when the site has no usable dialling code', () => {
    expect(toE164('+442081380512', '')).toBe('+442081380512')
    expect(toE164('00442081380512', 'nonsense')).toBe('+442081380512')
    expect(toE164('02081380512', '')).toBeNull()
  })
})

describe('isE164', () => {
  it('knows the shape a provider will take', () => {
    expect(isE164('+442081380512')).toBe(true)
    expect(isE164('02081380512')).toBe(false)
    expect(isE164('+04420813805')).toBe(false)
  })
})
