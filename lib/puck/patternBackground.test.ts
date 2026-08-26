import { describe, it, expect } from 'vitest'
import { hasPattern, parsePatternRatio, patternCss, patternHostStyle, patternSizeStep, patternTileHeight, patternUrl, snapPatternWidth } from '@/lib/puck/patternBackground'

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

  it('can size the tile differently in dark mode', () => {
    const css = patternCss('abc', { patternImage: '/a.svg', patternSize: '120px', patternSizeDark: '240px' })
    expect(css).toContain('background-size:120px')
    expect(css).toContain('[data-theme="dark"] [data-pattern-id="abc"]::before{background-size:240px !important;}')
    expect(css).toContain('@media(prefers-color-scheme:dark)')
  })

  it('takes a dark size with no dark image, and vice versa', () => {
    expect(patternCss('abc', { patternImage: '/a.svg', patternSizeDark: '240px' })).toContain('background-size:240px !important')
    const imageOnly = patternCss('abc', { patternImage: '/a.svg', patternImageDark: '/b.svg' })
    expect(imageOnly).toContain('background-image:url("/b.svg")')
    expect(imageOnly).not.toContain('!important')
  })

  // Dark sizes cascade desktop -> tablet -> mobile like every other responsive
  // field, and the two conditions are combined into ONE query: nested @media is
  // not something every browser this runs in supports.
  it('sizes the dark tile per breakpoint through one combined query', () => {
    const css = patternCss('abc', { patternSize: { desktop: '120px', mobile: '60px' }, patternSizeDark: { desktop: '240px', mobile: '100px' }, patternImage: '/a.svg' })
    expect(css).toContain('[data-theme="dark"] [data-pattern-id="abc"]::before{background-size:240px !important;}')
    expect(css).toMatch(/@media\(max-width:\d+px\)\{\[data-theme="dark"\][^}]+background-size:100px !important;\}\}/)
    expect(css).toMatch(/@media\(prefers-color-scheme:dark\) and \(max-width:\d+px\)/)
    expect(css).not.toContain('background-size:auto !important')
  })

  // A dark size left blank at every breakpoint means "same as light" - not
  // 'auto', which would quietly undo the light size.
  it('leaves the light size alone when only a dark IMAGE is set', () => {
    const css = patternCss('abc', { patternSize: '120px', patternImage: '/a.svg', patternImageDark: '/b.svg' })
    expect(css).toContain('background-size:120px')
    expect(css).not.toContain('background-size:auto')
  })

  it('says nothing about dark mode when neither a dark image nor a dark size is set', () => {
    expect(patternCss('abc', { patternImage: '/a.svg', patternSize: '120px' })).not.toContain('data-theme="dark"')
  })

  // THE join bug. `background-size` sets the width and the browser derives the
  // height from the image's proportions: a 660x472 tile drawn 96px wide is
  // 68.6545px tall, so every join lands part-way through a device pixel, the
  // tile's last row renders light, and a pale line crosses the pattern once per
  // tile. Measured on the live site: joins at device y 265.3 / 402.6 / 539.9.
  // Snapping the width so the height is whole puts them on 246 / 364 / 482.
  describe('snapping the tile so its height is a whole number', () => {
    it('reduces the ratio and halves it while the height stays whole', () => {
      expect(patternSizeStep(660, 472)).toEqual({ width: 82.5, height: 59 })   // 165:118
      expect(patternSizeStep(225, 400)).toEqual({ width: 0.5625, height: 1 })  // 9:16
      expect(patternSizeStep(800, 800)).toEqual({ width: 1, height: 1 })       // square
    })

    it('snaps a width to the nearest one with a whole height', () => {
      const r = { w: 660, h: 472 }
      expect(snapPatternWidth(96, r)).toBe(82.5)
      expect(snapPatternWidth(160, r)).toBe(165)
      expect(patternTileHeight(snapPatternWidth(96, r), r)).toBe(59)
      expect(patternTileHeight(snapPatternWidth(160, r), r)).toBe(118)
    })

    it('leaves a square tile alone - it was never able to land fractionally', () => {
      expect(snapPatternWidth(80, { w: 800, h: 800 })).toBe(80)
    })

    it('never snaps to zero, however small the size', () => {
      expect(snapPatternWidth(1, { w: 660, h: 472 })).toBe(82.5)
      expect(snapPatternWidth(0, { w: 660, h: 472 })).toBe(0)
    })

    it('emits the snapped width in the css', () => {
      const css = patternCss('abc', { patternImage: '/a.svg', patternSize: '96px', patternRatio: '660x472' })
      expect(css).toContain('background-size:82.5px;')
      expect(css).not.toContain('96px')
    })

    it('snaps the dark size too, and each breakpoint', () => {
      const css = patternCss('abc', {
        patternImage: '/a.svg', patternRatio: '660x472',
        patternSize: { desktop: '160px', mobile: '96px' }, patternSizeDark: '300px',
      })
      expect(css).toContain('background-size:165px;')
      expect(css).toMatch(/@media\(max-width:\d+px\)\{[^}]*background-size:82\.5px !important\}/)
      expect(css).toContain('background-size:330px !important;')
    })

    it('does nothing without a measurement, so old blocks render as before', () => {
      const css = patternCss('abc', { patternImage: '/a.svg', patternSize: '96px' })
      expect(css).toContain('background-size:96px;')
    })

    it('ignores a malformed or zero measurement rather than dividing by it', () => {
      for (const bad of ['', 'x', '660', '660x', '0x472', '660x0', '-660x472']) {
        expect(parsePatternRatio(bad), bad).toBeNull()
        expect(patternCss('abc', { patternImage: '/a.svg', patternSize: '96px', patternRatio: bad })).toContain('background-size:96px;')
      }
    })

    // rem/%/vw resolve against things patternCss cannot see, so they are passed
    // through untouched; the editor converts them to px when it measures.
    it('passes a non-px size through untouched', () => {
      const css = patternCss('abc', { patternImage: '/a.svg', patternSize: '6rem', patternRatio: '660x472' })
      expect(css).toContain('background-size:6rem;')
    })
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
