import { describe, it, expect } from 'vitest'
import { themeToggleVars, type ThemeToggleAppearance } from '@/components/ThemeToggle'

// The block's appearance fields are additive: every site that already has a
// Theme Toggle in a header or the admin rail must keep the round grey icon
// button it has today. These cases pin that, and the box maths the three header
// icon blocks share (plain / bordered / filled), so a future tidy of the CSS
// can't quietly restyle every install's toggle.
describe('themeToggleVars', () => {
  it('emits nothing when there is no appearance at all (admin sidebar)', () => {
    expect(themeToggleVars(undefined)).toBeUndefined()
    expect(themeToggleVars({})).toBeUndefined()
  })

  it('leaves the box alone for the default variant, so pre-existing blocks are untouched', () => {
    const vars = themeToggleVars({ variant: 'default', iconSize: 18 }) as Record<string, string>
    expect(vars['--tt-icon']).toBe('18px')
    for (const k of ['--tt-box', '--tt-pad', '--tt-radius', '--tt-bg', '--tt-border', '--tt-shadow']) {
      expect(vars[k]).toBeUndefined()
    }
  })

  it('plain drops the box entirely and matches the neighbouring icons\' colour', () => {
    const vars = themeToggleVars({ variant: 'plain', iconSize: 20 }) as Record<string, string>
    expect(vars['--tt-pad']).toBe('0')
    expect(vars['--tt-radius']).toBe('0')
    expect(vars['--tt-bg']).toBe('transparent')
    expect(vars['--tt-border']).toBe('none')
    expect(vars['--tt-shadow']).toBe('none')
    expect(vars['--tt-box']).toBe('auto')
    expect(vars['--tt-fg']).toBe('var(--color-text)')
    expect(vars['--tt-icon']).toBe('20px')
  })

  it('bordered takes the same padding, radius and border rule as the sign-in block', () => {
    const vars = themeToggleVars({ variant: 'bordered', borderRadius: 12 }) as Record<string, string>
    expect(vars['--tt-pad']).toBe('0.5rem 0.875rem')
    expect(vars['--tt-radius']).toBe('12px')
    expect(vars['--tt-bg']).toBe('transparent')
    expect(vars['--tt-border']).toBe('1px solid var(--color-border)')
  })

  it('filled uses the surface colour and no border, and honours explicit colours', () => {
    const a: ThemeToggleAppearance = { variant: 'filled', bgColour: 'var(--color-1)', iconColour: '#fff' }
    const vars = themeToggleVars(a) as Record<string, string>
    expect(vars['--tt-bg']).toBe('var(--color-1)')
    expect(vars['--tt-border']).toBe('none')
    expect(vars['--tt-fg']).toBe('#fff')
    expect(vars['--tt-fg-hover']).toBe('#fff')
  })

  it('keeps the chosen background on hover rather than the rail button\'s raised surface', () => {
    const vars = themeToggleVars({ variant: 'filled', bgColour: 'red' }) as Record<string, string>
    expect(vars['--tt-bg-hover']).toBe(vars['--tt-bg'])
  })

  it('defaults the corner radius to the 8px the other two blocks default to', () => {
    const vars = themeToggleVars({ variant: 'bordered' }) as Record<string, string>
    expect(vars['--tt-radius']).toBe('8px')
  })
})
