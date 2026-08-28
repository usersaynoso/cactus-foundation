import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { getModuleLayoutPuckConfig, puckConfig } from '@/lib/puck/config'
import { DOCUMENT_FOOTER_LAYOUT_TYPE } from '@/lib/documents/page-settings'

// The running footer is drawn into the bottom margin of a printed page, a strip
// a few millimetres tall. Every block's default breathing room was picked for a
// web page - 1.5rem above and below a rule, 1.5rem under a line of text, 1em
// under each paragraph - and in the strip that is most of the strip.
//
// So the footer config closes those defaults up. The risk this pins is the
// difference between a DEFAULT and a SAVED value: Puck's RSC render hands a
// block exactly the props that were stored, so a footer published before the
// spacing fields existed carries none of them and must pick up the footer's
// nothing rather than the block's 1.5rem - while an owner who has deliberately
// set 4px under a rule must keep their 4px.

const footerConfig = getModuleLayoutPuckConfig(DOCUMENT_FOOTER_LAYOUT_TYPE)

/** As Puck's RSC render does it: saved props only, no defaultProps merge. */
const renderSaved = (config: any, type: string, props: Record<string, unknown>) => {
  const Block = config.components[type].render
  return renderToStaticMarkup(<Block {...props} id={`${type}-1`} />)
}

describe('a block in the document footer', () => {
  it('brings no space of its own when nothing was ever saved on it', () => {
    const html = renderSaved(footerConfig, 'Divider', {})
    expect(html).toContain('margin-top:0')
    expect(html).toContain('margin-bottom:0')
    expect(html).not.toContain('1.5rem')
  })

  it('closes up a text block that predates the spacing fields', () => {
    const html = renderSaved(footerConfig, 'TextBlock', { content: 'Company number 1234567' })
    expect(html).toContain('margin-bottom:0')
    expect(html).not.toContain('margin-bottom:1.5rem')
  })

  it('takes the paragraph gap out of rich text as well', () => {
    const html = renderSaved(footerConfig, 'RichTextBlock', { content: '<p>x</p>' })
    expect(html).toContain('--puck-richtext-p-space:0')
  })

  it('leaves a figure the owner actually chose exactly where they set it', () => {
    const html = renderSaved(footerConfig, 'Divider', { spaceBelow: 'sm', spaceBelowPx: '4px' })
    expect(html).toContain('margin-bottom:4px')
  })

  it('starts a newly dropped block closed up too', () => {
    const defaults = (footerConfig.components as any).Divider.defaultProps
    expect(defaults.spaceAbove).toBe('none')
    expect(defaults.spaceBelow).toBe('none')
  })
})

describe('everywhere that is not the document footer', () => {
  it('keeps the generous page spacing it always had', () => {
    const html = renderSaved(puckConfig, 'Divider', {})
    expect(html).toContain('margin-top:1.5rem')
    expect(html).toContain('margin-bottom:1.5rem')
  })

  it('leaves another module-style layout type alone', () => {
    const card = getModuleLayoutPuckConfig('shopProductCard')
    expect(renderSaved(card, 'Divider', {})).toContain('margin-top:1.5rem')
  })
})
