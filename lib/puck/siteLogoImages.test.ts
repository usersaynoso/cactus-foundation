import { describe, it, expect } from 'vitest'
import { siteLogoImages } from '@/lib/puck/siteLogoAlign'

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
