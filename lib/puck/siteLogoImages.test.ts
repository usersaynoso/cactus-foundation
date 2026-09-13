import { describe, it, expect } from 'vitest'
import { SITE_LOGO_DARK_MEDIA, SITE_LOGO_LIGHT_MEDIA, siteLogoFetchPlan, siteLogoImages } from '@/lib/puck/siteLogoAlign'

const SITE_LIGHT = 'https://media.example.com/lockup.svg'
const SITE_DARK = 'https://media.example.com/lockup-dark.svg'
const MARK_LIGHT = 'https://media.example.com/mark.svg'
const MARK_DARK = 'https://media.example.com/mark-dark.svg'

describe('siteLogoImages', () => {
  it('uses the site logo pair when the block picks no image of its own', () => {
    expect(siteLogoImages('', '', SITE_LIGHT, SITE_DARK)).toEqual({ light: SITE_LIGHT, dark: SITE_DARK })
    expect(siteLogoImages(undefined, undefined, SITE_LIGHT, SITE_DARK)).toEqual({ light: SITE_LIGHT, dark: SITE_DARK })
  })

  it('replaces the whole pair when the block picks its own image', () => {
    expect(siteLogoImages(MARK_LIGHT, MARK_DARK, SITE_LIGHT, SITE_DARK)).toEqual({ light: MARK_LIGHT, dark: MARK_DARK })
  })

  // The point of the whole helper: half an override must never pair a block's
  // own mark in light mode with the site's lockup in dark mode.
  it('never borrows the site dark logo to fill a half-set override', () => {
    expect(siteLogoImages(MARK_LIGHT, '', SITE_LIGHT, SITE_DARK)).toEqual({ light: MARK_LIGHT, dark: null })
  })

  it('ignores whitespace-only values on both arms', () => {
    expect(siteLogoImages('   ', '  ', SITE_LIGHT, SITE_DARK)).toEqual({ light: SITE_LIGHT, dark: SITE_DARK })
    expect(siteLogoImages(MARK_LIGHT, '   ', SITE_LIGHT, SITE_DARK)).toEqual({ light: MARK_LIGHT, dark: null })
  })

  it('reports no image at all when neither the block nor the site has one', () => {
    expect(siteLogoImages('', '', null, null)).toEqual({ light: null, dark: null })
  })
})

// The logo's fetch plan. What matters is that the hidden variant of a pair is never
// downloaded in any theme state, and that a single logo is left exactly as it was.
// Both render halves take their `loading` value and their preloads from here, so
// this is the one place the behaviour can be pinned.
describe('siteLogoFetchPlan', () => {
  it('leaves a single logo eager with nothing extra preloaded - it is shown in both schemes', () => {
    expect(siteLogoFetchPlan(SITE_LIGHT, null)).toEqual({ loading: undefined, preloads: [] })
  })

  it('makes a light/dark pair lazy, so whichever variant CSS hides is never requested', () => {
    expect(siteLogoFetchPlan(SITE_LIGHT, SITE_DARK).loading).toBe('lazy')
  })

  it('preloads each half only under the colour scheme that shows it', () => {
    expect(siteLogoFetchPlan(SITE_LIGHT, SITE_DARK).preloads).toEqual([
      { href: SITE_LIGHT, media: SITE_LOGO_LIGHT_MEDIA },
      { href: SITE_DARK, media: SITE_LOGO_DARK_MEDIA },
    ])
  })

  it('uses conditions that cannot both miss, so the visible logo is always preloaded', () => {
    // globals.css shows the dark image under a dark preference and the light one
    // in every other case. The light condition is the exact negation, not a
    // separate `(prefers-color-scheme: light)` that a browser could answer "no" to
    // alongside the dark one.
    expect(SITE_LOGO_DARK_MEDIA).toBe('(prefers-color-scheme: dark)')
    expect(SITE_LOGO_LIGHT_MEDIA).toBe(`not all and ${SITE_LOGO_DARK_MEDIA}`)
  })
})
