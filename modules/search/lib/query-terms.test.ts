import { describe, it, expect } from 'vitest'
import { splitPrefix, looseTerms } from './query-terms'

describe('splitPrefix', () => {
  it('holds every leading term back as required text', () => {
    // The regression: the trailing word used to be ORed over the whole query,
    // so a full product name matched anything containing its last word and the
    // named product sank hundreds of rows down.
    expect(splitPrefix('Oslo Air Height Adjustable Office Desk')).toEqual({
      head: 'Oslo Air Height Adjustable Office',
      prefix: 'Desk',
    })
  })

  it('gives a single word no head', () => {
    expect(splitPrefix('desk')).toEqual({ head: '', prefix: 'desk' })
  })

  it('ignores surrounding whitespace', () => {
    expect(splitPrefix('  oslo   desk  ')).toEqual({ head: 'oslo', prefix: 'desk' })
  })

  it('leaves a one-character trailing token alone', () => {
    expect(splitPrefix('oslo d')).toEqual({ head: 'oslo d', prefix: null })
  })

  it('leaves a non-alphanumeric trailing token alone', () => {
    expect(splitPrefix('oslo desk!')).toEqual({ head: 'oslo desk!', prefix: null })
  })

  it.each([
    ['a quoted phrase', '"office desk"'],
    ['a negated term', 'desk -oslo'],
    ['the or operator', 'desk or chair'],
    ['the OR operator in caps', 'desk OR chair'],
  ])('does not touch %s', (_label, q) => {
    expect(splitPrefix(q)).toEqual({ head: q, prefix: null })
  })
})

describe('looseTerms', () => {
  it('ors every term as a prefix', () => {
    expect(looseTerms('Oslo Air Desk')).toBe('Oslo:* | Air:* | Desk:*')
  })

  it('strips characters to_tsquery would choke on', () => {
    expect(looseTerms('oslo & desk!')).toBe('oslo:* | desk:*')
  })

  it('returns null for a single term - there is nothing to relax', () => {
    expect(looseTerms('desk')).toBeNull()
    expect(looseTerms('  desk  ')).toBeNull()
  })
})
