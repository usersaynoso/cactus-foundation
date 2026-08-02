import { describe, it, expect } from 'vitest'
import { parsePaginationParams } from '@/lib/utils'

// Every list in the admin (and the directory module's entries endpoint) reads
// its paging through this one helper, so anything it lets past reaches Prisma as
// `skip`/`take`. Prisma throws on a non-integer there, which means a junk query
// string is the difference between "page one" and a 500.
describe('parsePaginationParams', () => {
  const of = (params: Record<string, string>) => parsePaginationParams(new URLSearchParams(params))

  it('reads a plain page and perPage', () => {
    expect(of({ page: '3', perPage: '10' })).toEqual({ page: 3, perPage: 10, skip: 20 })
  })

  it('falls back to page one and the default size when nothing is given', () => {
    expect(parsePaginationParams(new URLSearchParams())).toEqual({ page: 1, perPage: 25, skip: 0 })
  })

  it('honours a caller-supplied default page size', () => {
    expect(parsePaginationParams(new URLSearchParams(), 12)).toEqual({ page: 1, perPage: 12, skip: 0 })
  })

  // The regression this file exists for. Math.max(1, NaN) is NaN, not 1, so a
  // clamp alone never caught unparseable input - it sailed straight through to
  // skip: NaN.
  it('treats an unparseable page as page one rather than NaN', () => {
    const { page, skip } = of({ page: 'abc' })
    expect(page).toBe(1)
    expect(skip).toBe(0)
    expect(Number.isNaN(skip)).toBe(false)
  })

  it('treats an unparseable perPage as the default rather than NaN', () => {
    const { perPage } = of({ perPage: 'lots' })
    expect(perPage).toBe(25)
  })

  it('never returns a negative skip for a zero or negative page', () => {
    expect(of({ page: '0' }).skip).toBe(0)
    expect(of({ page: '-4' }).skip).toBe(0)
  })

  it('caps perPage so one request cannot ask for the whole table', () => {
    expect(of({ perPage: '100000' }).perPage).toBe(100)
    expect(of({ perPage: '0' }).perPage).toBe(1)
  })

  // Next hands server components a plain object whose repeated keys arrive as
  // arrays; both shapes go through the same helper.
  it('accepts a plain search-params object, taking the first of a repeated key', () => {
    expect(parsePaginationParams({ page: ['2', '9'], perPage: '5' })).toEqual({ page: 2, perPage: 5, skip: 5 })
  })

  it('treats an empty repeated key as absent rather than NaN', () => {
    expect(parsePaginationParams({ page: [] })).toEqual({ page: 1, perPage: 25, skip: 0 })
  })
})
