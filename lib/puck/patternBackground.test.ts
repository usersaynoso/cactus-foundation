import { describe, it, expect } from 'vitest'
import { hasPattern, patternCss, patternHostStyle, patternUrl } from '@/lib/puck/patternBackground'

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

  // Centring a REPEATED background lands the tile grid on a fractional pixel and
  // the browser draws hairline gaps between the tiles.
  it('starts the tile grid at the corner, never centred', () => {
    const css = patternCss('abc', { patternImage: '/a.svg' })
    expect(css).toContain('background-position:0 0')
    expect(css).not.toContain('background-position:center')
  })

  // Two blocks stacked flush show a hairline of the page between them whenever
  // their heights land on a fractional pixel.
  it('bleeds a pixel top and bottom so neighbours overlap the seam', () => {
    expect(patternCss('abc', { patternImage: '/a.svg' })).toContain('inset:-1px 0')
  })

  it('rounds a fractional pixel size, which would tile with seams', () => {
    expect(patternCss('abc', { patternImage: '/a.svg', patternSize: '240.5px' })).toContain('background-size:241px')
    expect(patternCss('abc', { patternImage: '/a.svg', patternSize: '0.2px' })).toContain('background-size:1px')
    // Other units are relative to things this cannot resolve - passed through.
    expect(patternCss('abc', { patternImage: '/a.svg', patternSize: '12.5rem' })).toContain('background-size:12.5rem')
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

  // The page root wraps every Section on the page, and an overflow:hidden
  // ancestor silently disables position:sticky in all of them.
  it('can make that stacking context without clipping', () => {
    expect(patternHostStyle({ patternImage: '/a.svg' }, { clip: false })).toEqual({ isolation: 'isolate', position: 'relative' })
    expect(patternHostStyle({}, { clip: false })).toEqual({})
  })

  // An inbox has no origin to resolve a same-origin path against.
  it('can insist on an absolute URL, for the email wrapper', () => {
    expect(patternUrl('/media/a.svg')).toBe('/media/a.svg')
    expect(patternUrl('/media/a.svg', { requireAbsolute: true })).toBeNull()
    expect(patternUrl('https://cdn.test/a.svg', { requireAbsolute: true })).toBe('https://cdn.test/a.svg')
  })
})
