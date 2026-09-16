import { describe, expect, it } from 'vitest'
import { openRichTextLinksInNewTab } from '@/lib/puck/richtext-links'

describe('openRichTextLinksInNewTab', () => {
  it('opens a plain anchor in a new tab', () => {
    const html = '<a href="/delivery-and-installations">Delivery and installations</a>'
    expect(openRichTextLinksInNewTab(html)).toBe(
      '<a href="/delivery-and-installations" target="_blank" rel="noopener noreferrer">Delivery and installations</a>',
    )
  })

  it('leaves an anchor that already names a target alone', () => {
    const html = '<a href="/terms" target="_self">Terms</a>'
    expect(openRichTextLinksInNewTab(html)).toBe(html)
  })

  it('handles several anchors in one block', () => {
    const html = '<p><a href="/one">One</a> · <a href="/two">Two</a></p>'
    expect(openRichTextLinksInNewTab(html)).toContain('href="/one" target="_blank" rel="noopener noreferrer"')
    expect(openRichTextLinksInNewTab(html)).toContain('href="/two" target="_blank" rel="noopener noreferrer"')
  })
})
