import { describe, it, expect } from 'vitest'
import { searchSizeStyles } from './SiteSearchBlock'
import { SRCH_SIZE_VARS } from '../public/search-css'

// The Size field is per-breakpoint, and the whole point of the split below is
// that a box which has only ever had one size keeps rendering exactly as it did
// - same class, not a single byte of extra CSS - while a box with a different
// size on phones gets media rules scoped to itself and nothing else.

describe('searchSizeStyles', () => {
  it('leaves a single-size box alone', () => {
    expect(searchSizeStyles({ desktop: 'medium' }, 'abc')).toEqual({ sizeClass: 'srch-size-medium', sizeCss: '' })
  })

  it('reads legacy plain-string data as desktop-only', () => {
    expect(searchSizeStyles('large', 'abc')).toEqual({ sizeClass: 'srch-size-large', sizeCss: '' })
  })

  it('falls back to medium for a missing or unknown size', () => {
    expect(searchSizeStyles(undefined, 'abc').sizeClass).toBe('srch-size-medium')
    expect(searchSizeStyles('enormous', 'abc').sizeClass).toBe('srch-size-medium')
  })

  it('emits a mobile-only rule scoped to the block when phones differ', () => {
    const { sizeClass, sizeCss } = searchSizeStyles({ desktop: 'medium', mobile: 'small' }, 'abc')
    expect(sizeClass).toBe('srch-size-medium')
    expect(sizeCss).toContain('[data-srch-id="abc"]')
    expect(sizeCss).toContain('max-width:640px')
    // The small size's own values, not the medium ones it overrides.
    expect(sizeCss).toContain('--srch-font:.8125rem')
    expect(sizeCss).not.toContain('min-width') // no tablet rule: tablet inherits desktop
  })

  it('cascades tablet down to mobile', () => {
    const { sizeCss } = searchSizeStyles({ desktop: 'large', tablet: 'small' }, 'abc')
    // Tablet differs from desktop, and mobile inherits tablet, so both rules land.
    expect(sizeCss).toContain('min-width')
    expect(sizeCss).toContain('max-width:640px')
  })

  it('emits nothing without a block id to scope the rules to', () => {
    expect(searchSizeStyles({ desktop: 'medium', mobile: 'small' }, undefined).sizeCss).toBe('')
  })

  it('uses the same declarations the stylesheet does', () => {
    const { sizeCss } = searchSizeStyles({ desktop: 'medium', mobile: 'large' }, 'abc')
    for (const decl of SRCH_SIZE_VARS.large.split(';')) expect(sizeCss).toContain(decl)
  })
})
