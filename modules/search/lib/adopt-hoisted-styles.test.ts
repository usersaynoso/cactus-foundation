// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { adoptHoistedStyles } from './adopt-hoisted-styles'

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

function hrefs(): string[] {
  return Array.from(document.head.querySelectorAll('style[data-href]')).map((el) => el.getAttribute('data-href') ?? '')
}

describe('adoptHoistedStyles', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
  })

  it('brings across a sheet the page has no namesake for', () => {
    adoptHoistedStyles(parse('<head><style data-href="shop-cards-abc" data-precedence="module">.shop-grid{display:grid}</style></head><body></body>'))
    expect(hrefs()).toEqual(['shop-cards-abc'])
    const style = document.head.querySelector('style[data-href="shop-cards-abc"]')
    expect(style?.textContent).toBe('.shop-grid{display:grid}')
    expect(style?.getAttribute('data-precedence')).toBe('module')
  })

  it('leaves an identical sheet alone', () => {
    document.head.innerHTML = '<style data-href="shop-cards-abc">.shop-grid{display:grid}</style>'
    adoptHoistedStyles(parse('<head><style data-href="shop-cards-abc">.shop-grid{display:grid}</style></head><body></body>'))
    expect(hrefs()).toEqual(['shop-cards-abc'])
  })

  // The fetched page carries the whole site chrome. A page running a variant of
  // the same sheet (a stripped checkout header) must keep its own.
  it('does not overwrite a same-named sheet with a different hash', () => {
    document.head.innerHTML = '<style data-href="site-header-111">.h{color:red}</style>'
    adoptHoistedStyles(parse('<head><style data-href="site-header-222">.h{color:blue}</style></head><body></body>'))
    expect(hrefs()).toEqual(['site-header-111'])
  })

  it('ignores styles with no data-href and anything outside the head', () => {
    adoptHoistedStyles(parse('<head><style>.x{color:red}</style></head><body><style data-href="body-sheet-9">.y{}</style></body>'))
    expect(hrefs()).toEqual([])
  })
})
