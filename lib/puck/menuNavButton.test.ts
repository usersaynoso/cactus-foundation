import { describe, it, expect } from 'vitest'
import { navButtonWidthCss } from '@/lib/puck/menuNavButton'

// The point of these: a menu nobody has touched must emit no CSS at all (the
// trigger has rendered at its content width since it existed), and a menu that
// asks for a full-width trigger on one breakpoint must not leak that rule into
// the others.

describe('navButtonWidthCss', () => {
  it('emits nothing for a menu that has never set the field', () => {
    expect(navButtonWidthCss('menu-1', undefined)).toBe('')
    expect(navButtonWidthCss('menu-1', { desktop: 'auto' })).toBe('')
    expect(navButtonWidthCss('menu-1', 'auto')).toBe('')
  })

  it('emits nothing without a block id to scope the rule to', () => {
    expect(navButtonWidthCss(undefined, { mobile: 'full' })).toBe('')
  })

  it('fills on mobile only, leaving desktop and tablet alone', () => {
    const css = navButtonWidthCss('menu-1', { desktop: 'auto', mobile: 'full' })
    expect(css).toContain('[data-menu-dd-id="menu-1"] > button')
    expect(css).toContain('max-width:640px')
    expect(css).toContain('width:100%')
    expect(css).toContain('justify-content:space-between')
    // One rule, mobile's: no bare (desktop) rule and no tablet media query.
    expect(css.split('\n')).toHaveLength(1)
    expect(css).not.toContain('min-width')
  })

  it('cascades a tablet setting down to mobile', () => {
    const css = navButtonWidthCss('menu-1', { desktop: 'auto', tablet: 'full' })
    expect(css).toContain('min-width')
    expect(css).toContain('max-width:640px')
  })

  it('puts a desktop fill in a plain rule and only overrides where phones differ', () => {
    const css = navButtonWidthCss('menu-1', { desktop: 'full', mobile: 'auto' })
    const lines = css.split('\n')
    expect(lines[0]).toBe('[data-menu-dd-id="menu-1"] > button{width:100%;justify-content:space-between;}')
    expect(css).toContain('width:auto !important')
  })
})
