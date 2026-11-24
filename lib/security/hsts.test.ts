import { describe, it, expect, vi } from 'vitest'
import { DEFAULT_HSTS, normaliseHsts, resolveHsts } from './hsts'

describe('resolveHsts', () => {
  it('keeps the long-standing header byte for byte when unset or blank', () => {
    expect(DEFAULT_HSTS).toBe('max-age=63072000; includeSubDomains; preload')
    const warn = vi.fn()
    expect(resolveHsts(undefined, warn)).toBe(DEFAULT_HSTS)
    expect(resolveHsts('', warn)).toBe(DEFAULT_HSTS)
    expect(resolveHsts('   ', warn)).toBe(DEFAULT_HSTS)
    expect(warn).not.toHaveBeenCalled()
  })

  it('sends the override when it is a valid value', () => {
    const warn = vi.fn()
    expect(resolveHsts('max-age=31536000', warn)).toBe('max-age=31536000')
    expect(resolveHsts('max-age=31536000; includeSubDomains', warn)).toBe('max-age=31536000; includeSubDomains')
    expect(resolveHsts('max-age=0', warn)).toBe('max-age=0')
    expect(warn).not.toHaveBeenCalled()
  })

  it('tidies case, spacing, quotes and directive order', () => {
    expect(resolveHsts('  PRELOAD ;MAX-AGE = "300";includesubdomains; ')).toBe('max-age=300; includeSubDomains; preload')
    expect(resolveHsts('max-age=0031536000')).toBe('max-age=31536000')
  })

  it('drops the header for off, in any case', () => {
    const warn = vi.fn()
    expect(resolveHsts('off', warn)).toBeNull()
    expect(resolveHsts(' OFF ', warn)).toBeNull()
    expect(warn).not.toHaveBeenCalled()
  })

  it.each([
    'includeSubDomains',
    'max-age=',
    'max-age=-1',
    'max-age=1.5',
    'max-age=abc',
    'max-age=99999999999',
    'max-age=300; max-age=600',
    'max-age=300; preload; preload',
    'max-age=300; includeSubDomains; includeSubDomains',
    'max-age=300, includeSubDomains',
    'max-age=300; foo',
    'no',
    'false',
    'Strict-Transport-Security: max-age=300',
  ])('falls back to the default and warns once for %j', (raw) => {
    const warn = vi.fn()
    expect(resolveHsts(raw, warn)).toBe(DEFAULT_HSTS)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('CACTUS_HSTS'))
  })
})

describe('normaliseHsts', () => {
  it('returns the default unchanged', () => {
    expect(normaliseHsts(DEFAULT_HSTS)).toBe(DEFAULT_HSTS)
  })
})
