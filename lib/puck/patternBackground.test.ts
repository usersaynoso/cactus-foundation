import { describe, it, expect } from 'vitest'
import { hasPattern, patternCss, patternHostStyle } from '@/lib/puck/patternBackground'

describe('patternBackground', () => {
  it('emits nothing at all when no pattern is picked', () => {
    expect(patternCss('abc', {})).toBe('')
    expect(hasPattern({})).toBe(false)
    expect(patternHostStyle({})).toEqual({})
  })

  it('paints the light pattern behind the block content', () => {
    const css = patternCss('abc', { patternImage: '/media/dots.svg' })
    expect(css).toContain('[data-pattern-id="abc"]::before')
    expect(css).toContain('background-image:url("/media/dots.svg")')
    expect(css).toContain('z-index:-1')
    expect(css).toContain('background-repeat:repeat')
    expect(css).toContain('background-size:auto')
  })

  it('swaps the image in dark mode, chosen theme or system default', () => {
    const css = patternCss('abc', { patternImage: '/a.svg', patternImageDark: '/b.svg' })
    expect(css).toContain('[data-theme="dark"] [data-pattern-id="abc"]::before{background-image:url("/b.svg");}')
    expect(css).toContain('@media(prefers-color-scheme:dark)')
    expect(css).toContain(':root:not([data-theme="light"])')
  })

  it('leaves dark mode on the light pattern when no override is set', () => {
    const css = patternCss('abc', { patternImage: '/a.svg' })
    expect(css).not.toContain('data-theme="dark"')
  })

  it('sizes the tile, per breakpoint', () => {
    const css = patternCss('abc', { patternImage: '/a.svg', patternSize: { desktop: '240px', mobile: '120px' } })
    expect(css).toContain('background-size:240px')
    expect(css).toContain('background-size:120px !important')
  })

  // Both values land inside a <style> tag, so anything that could close the
  // declaration has to be refused rather than escaped.
  it('refuses a URL that could break out of the declaration', () => {
    for (const bad of ['/a.svg");}body{display:none', 'javascript:alert(1)', 'data:image/svg+xml,<svg/>', 'a.svg', '/a b.svg']) {
      expect(patternCss('abc', { patternImage: bad }), bad).toBe('')
      expect(hasPattern({ patternImage: bad }), bad).toBe(false)
    }
  })

  it('falls back to the natural size when the size is not a plain length', () => {
    const css = patternCss('abc', { patternImage: '/a.svg', patternSize: '240px;} body{display:none' })
    expect(css).toContain('background-size:auto')
    expect(css).not.toContain('display:none')
  })

  it('makes the host a clipped stacking context once a pattern is on', () => {
    expect(patternHostStyle({ patternImage: '/a.svg' })).toEqual({ isolation: 'isolate', overflow: 'hidden', position: 'relative' })
  })
})
