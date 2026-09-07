import { describe, it, expect } from 'vitest'
import { mobileBarCss, MOBILE_BAR_DEFAULTS } from '@/lib/puck/mobileBar'

// The bar is fixed furniture over every page, so the two things worth pinning
// down are what it costs a page that does not want it, and - the one that got
// away - that a page which does not want it does not simply RENDER it. The
// markup is in the page at every width; only the painting is conditional. A
// stylesheet built entirely inside a media query therefore left a phones-only
// bar showing on desktop as a bulleted list of its own items, in the header.

describe('mobileBarCss', () => {
  it('hides the bar unconditionally before anything else, so a width it is off at draws nothing', () => {
    const css = mobileBarCss('abc', { barOn: 'mobile', height: 60 })
    expect(css.startsWith('[data-cmb-id="abc"]{display:none;}')).toBe(true)
    // The panel and its scrim are hidden by name, not by inheriting from the
    // bar: they are fixed-position boxes that would otherwise cover the page.
    expect(css).toContain('[data-cmb-id="abc"] .cmb-sheet,[data-cmb-id="abc"] .cmb-scrim{display:none;}')
    // ...and everything that hides has to come BEFORE the query that shows.
    expect(css.indexOf('display:none')).toBeLessThan(css.indexOf('@media'))
  })

  it('keeps the page padding and the offset variable inside the query', () => {
    const css = mobileBarCss('abc', { barOn: 'mobile', height: 60 })
    expect(css).toContain('body{padding-bottom:calc(60px')
    expect(css).toContain('--cactus-bottom-bar-offset')
    // Both would otherwise pad and offset every desktop page for a bar it does
    // not show.
    expect(css.indexOf('body{padding-bottom')).toBeGreaterThan(css.indexOf('@media'))
  })

  it('turns the bar and its panel back on inside the query', () => {
    const css = mobileBarCss('abc', { barOn: 'mobile' })
    const shown = css.slice(css.indexOf('@media'))
    expect(shown).toContain('display:block')
    expect(shown).toContain('position:fixed')
    // Named one by one rather than counted, because each is a box the base
    // state hid and each has to come back on its own: the bar, the panel and
    // the scrim. (A count would also catch the icon's own svg rule and tell
    // you nothing about which of the three had gone missing.)
    expect(shown).toMatch(/\[data-cmb-id="abc"\]\{[^}]*display:block/)
    expect(shown).toMatch(/\[data-cmb-id="abc"\] \.cmb-scrim\{\s*display:block/)
    expect(shown).toMatch(/\[data-cmb-id="abc"\] \.cmb-sheet\{\s*display:block/)
  })

  it('emits two queries for phones and tablets, and none for every screen', () => {
    const both = mobileBarCss('abc', { barOn: 'mobileTablet' })
    expect(both.match(/@media\(max-width/g)?.length).toBe(1)
    expect(both).toContain('@media(min-width:')

    const all = mobileBarCss('abc', { barOn: 'all' })
    expect(all).not.toContain('@media(max-width')
    // Still hidden first and shown after, even with no query in the way - the
    // two rules are equal specificity, so the later one has to be the visible
    // one or a bar set to every screen would never appear at all.
    expect(all.indexOf('display:none')).toBeLessThan(all.indexOf('display:block'))
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
