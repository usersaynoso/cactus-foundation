import { describe, it, expect } from 'vitest'
import { mobileBarCss, MOBILE_BAR_DEFAULTS } from '@/lib/puck/mobileBar'

// The bar is fixed furniture over every page, so the thing worth pinning down is
// not how it looks but what it costs a page that does not want it: a bar set to
// phones only must add nothing at all to a desktop render, body padding
// included, or every desktop page grows a strip of dead space at the bottom.

describe('mobileBarCss', () => {
  it('wraps everything in the mobile query when the bar is phones-only', () => {
    const css = mobileBarCss('abc', { barOn: 'mobile', height: 60 })
    expect(css.startsWith('@media(max-width:')).toBe(true)
    // The page padding and the offset variable are inside the query too - they
    // are the two that would otherwise apply on every screen.
    expect(css).toContain('body{padding-bottom:calc(60px')
    expect(css).toContain('--cactus-bottom-bar-offset')
    expect(css.indexOf('body{padding-bottom')).toBeGreaterThan(css.indexOf('@media'))
  })

  it('emits two queries for phones and tablets, and none for every screen', () => {
    const both = mobileBarCss('abc', { barOn: 'mobileTablet' })
    expect(both.match(/@media\(max-width/g)?.length).toBe(1)
    expect(both).toContain('@media(min-width:')

    const all = mobileBarCss('abc', { barOn: 'all' })
    expect(all.startsWith('[data-cmb-id="abc"]')).toBe(true)
  })

  it('scopes every rule to the block that emitted it', () => {
    const css = mobileBarCss('block-1', { barOn: 'all' })
    for (const cls of ['.cmb-list', '.cmb-item', '.cmb-icon', '.cmb-label', '.cmb-badge', '.cmb-sheet', '.cmb-scrim']) {
      expect(css).toContain(`[data-cmb-id="block-1"] ${cls}`)
    }
    // Two bars on one page (a header one and a footer one, mid-redesign) must
    // not style each other.
    expect(css).not.toContain('[data-cmb-id="block-2"]')
  })

  it('clamps sizes that would break the bar rather than trusting the number typed', () => {
    const css = mobileBarCss('abc', { barOn: 'all', height: 5000, iconSize: 0, labelSize: 900 })
    expect(css).toContain('--cmb-h:140px')
    expect(css).toContain('--cmb-icon:22px') // 0 is falsy, so the default stands
    expect(css).toContain('--cmb-label:20px')
  })

  it('falls back to site tokens for every colour left blank', () => {
    const css = mobileBarCss('abc', { barOn: 'all' })
    expect(css).toContain('--cmb-bg:var(--color-surface, #fff)')
    expect(css).toContain('--cmb-active:var(--color-primary)')
    expect(MOBILE_BAR_DEFAULTS.bgColour).toBe('')
  })
})
