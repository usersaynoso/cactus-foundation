import { describe, it, expect } from 'vitest'
import { puckConfig } from '@/lib/puck/config.core'

// The CTA Banner used to hide its text colour behind the "Custom colours"
// background, which meant an owner on the Brand preset had to give the preset up
// to recolour the words sitting on it. Only the BACKGROUND colour belongs to
// Custom; the text and link colours are overrides that apply on top of any of
// the four backgrounds.
const cta = (puckConfig.components as Record<string, any>).CTABanner
const fieldsFor = (props: Record<string, unknown>) => Object.keys(cta.resolveFields({ props }, { fields: cta.fields }))

describe('CTA Banner colour fields', () => {
  it('offers text and link colours on a preset background', () => {
    const keys = fieldsFor({ background: 'brand' })
    expect(keys).toContain('textColor')
    expect(keys).toContain('linkColor')
    expect(keys).toContain('linkHoverColor')
  })

  it('keeps the background picker for Custom only', () => {
    expect(fieldsFor({ background: 'light' })).not.toContain('bgColor')
    expect(fieldsFor({ background: 'custom' })).toContain('bgColor')
  })

  it('still hides the pattern extras until a pattern is picked', () => {
    const bare = fieldsFor({ background: 'light' })
    expect(bare).not.toContain('patternImageDark')
    expect(bare).not.toContain('patternSize')
    expect(bare).not.toContain('patternSizeDark')

    const patterned = fieldsFor({ background: 'light', patternImage: '/a.svg' })
    expect(patterned).toContain('patternImageDark')
    expect(patterned).toContain('patternSize')
    expect(patterned).toContain('patternSizeDark')
  })

  // Every colour on this block carries its own dark arm through the shared
  // light-dark() encoding, which is what SiteColourField writes.
  it('paints all three with the site colour picker', () => {
    for (const key of ['textColor', 'linkColor', 'linkHoverColor']) {
      expect(cta.fields[key].type, key).toBe('custom')
      expect(cta.defaultProps[key], key).toBe('')
    }
  })
})
