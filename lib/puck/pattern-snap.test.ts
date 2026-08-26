import { describe, it, expect } from 'vitest'
import { puckConfig } from '@/lib/puck/config.core'
import { patternCss, patternSizeStep, snapPatternWidth } from '@/lib/puck/patternBackground'

const components = puckConfig.components as Record<string, any>
const HOSTS = ['Section', 'Hero', 'CTABanner']

describe('pattern join fix wiring', () => {
  // Every block that can carry a pattern has to measure it, or its size never
  // gets snapped and the join line comes back on that block alone.
  it('measures the tile on all four pattern hosts', () => {
    for (const name of HOSTS) expect(typeof components[name].resolveData, name).toBe('function')
    expect(typeof (puckConfig as any).root.resolveData).toBe('function')
  })

  it('carries the measurement in defaults so it is never undefined', () => {
    for (const name of HOSTS) expect(components[name].defaultProps, name).toHaveProperty('patternRatio', '')
    expect((puckConfig as any).root.defaultProps).toHaveProperty('patternRatio', '')
  })

  // 0.5.1326 offered a tile-height field. A typed height stretches the tile,
  // which draws a seam of its own; the height is derived now, never entered.
  it('offers no height field to type a stretched tile into', () => {
    for (const name of HOSTS) {
      const keys = Object.keys(components[name].fields)
      expect(keys, name).not.toContain('patternHeight')
      expect(keys, name).not.toContain('patternHeightDark')
    }
  })

  it('keeps the measurement out of the fields panel', () => {
    for (const name of HOSTS) expect(Object.keys(components[name].fields), name).not.toContain('patternRatio')
  })
})

// The regression that made the size box untypeable: resolveData fires on every
// keystroke, and a version that rewrote patternSize in it snapped "96" back to
// "82.5" under the owner's fingers. The resolver may only ever manage
// patternRatio - the owner's own fields must come back exactly as sent.
describe('resolveData never touches the typed size', () => {
  const section = (puckConfig.components as Record<string, any>).Section

  it('returns the data object untouched while the size is being typed', async () => {
    const data = { props: { patternImage: '/a.svg', patternRatio: '660x472', patternSize: '9px' } }
    // identity, not just equality: an untouched object means no editor dispatch
    expect(await section.resolveData(data, { changed: { patternSize: true } })).toBe(data)
  })

  it('keeps a rem size as typed even when it re-measures', async () => {
    // node has no Image, so measureTile yields null and the data passes through
    const data = { props: { patternImage: '/a.svg', patternSize: '6rem' } }
    const out = await section.resolveData(data, { changed: { patternImage: true } })
    expect(out.props?.patternSize ?? out.props.patternSize).toBe('6rem')
  })

  it('drops a stale measurement when the pattern is removed', async () => {
    const data = { props: { patternImage: '', patternRatio: '660x472', patternSize: '96px' } }
    const out = await section.resolveData(data, { changed: { patternImage: true } })
    expect(out.props.patternRatio).toBe('')
    expect(out.props.patternSize).toBe('96px')
  })
})

// The live numbers this was built from: deskwell.co.uk/home-new, hero pattern
// 660x472 at 6rem. Joins landed on device rows 265.3 / 402.6 / 539.9; snapped to
// 82.5px they land on 246 / 364 / 482 and the pale line goes.
describe('the live case', () => {
  it('turns the hero size into one whose tile height is whole', () => {
    const ratio = { w: 660, h: 472 }
    expect(patternSizeStep(660, 472)).toEqual({ width: 82.5, height: 59 })
    const snapped = snapPatternWidth(96, ratio)
    expect(snapped).toBe(82.5)
    expect(Number.isInteger(snapped * 472 / 660)).toBe(true)
    expect(patternCss('section-hero', { patternImage: '/showroom.svg', patternSize: '96px', patternRatio: '660x472' }))
      .toContain('background-size:82.5px;')
  })

  it('does the same for the categories tile, and leaves the square one alone', () => {
    expect(snapPatternWidth(64, { w: 225, h: 400 }) * 400 / 225).toBe(114)   // 9:16
    expect(snapPatternWidth(80, { w: 800, h: 800 })).toBe(80)                 // square, untouched
  })
})
