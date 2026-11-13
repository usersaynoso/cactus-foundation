import { describe, expect, it } from 'vitest'
import { DEFAULT_FILTERS, hasActiveFilters, parsePeopleFilters, peopleFiltersToParams } from './people-list-filters'

describe('people list filters', () => {
  it('round-trips through the address bar', () => {
    const f = { ...DEFAULT_FILTERS, q: 'smith', type: 'member' as const, customer: 'yes' as const, marketing: 'no' as const, sort: 'email' as const, dir: 'asc' as const, page: 3, perPage: 50 }
    expect(parsePeopleFilters(Object.fromEntries(peopleFiltersToParams(f)))).toEqual(f)
  })

  it('keeps a plain list on a plain address', () => {
    expect(peopleFiltersToParams(DEFAULT_FILTERS).toString()).toBe('')
  })

  it('ignores junk rather than trusting it', () => {
    const f = parsePeopleFilters({ customer: 'maybe', marketing: 'DROP TABLE', page: '-4', perPage: '1000', sort: 'password' })
    expect(f).toEqual(DEFAULT_FILTERS)
  })

  it('knows when anything narrows the list', () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false)
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, marketing: 'unknown' })).toBe(true)
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, sort: 'username' })).toBe(false)
  })
})
