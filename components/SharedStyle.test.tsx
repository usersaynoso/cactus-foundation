import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import { SharedStyle } from './SharedStyle'

// Why these exist rather than "it obviously works":
//
// The whole point of SharedStyle is that a page carries one copy of a stylesheet
// instead of five, and the mechanism is React's own href-keyed hoisting. Nothing
// in `tsc` or eslint can tell whether that hoisting actually happened, whether two
// blocks agreed on a name, or - the one that would be silent and disastrous -
// whether the CSS came out the other side intact. A `>` rendered as `&gt;` inside
// a <style> tag turns every child-combinator rule in a module's stylesheet into
// nothing, on every page, with no error anywhere.

const GRID = '.a > .b { color: red; }\n.c { content: "x & y"; }'

describe('SharedStyle', () => {
  it('emits the CSS verbatim - selectors survive HTML escaping', () => {
    const html = renderToString(<SharedStyle id="t" css={GRID} />)
    expect(html).toContain('.a > .b')
    expect(html).toContain('"x & y"')
    expect(html).not.toContain('&gt;')
    expect(html).not.toContain('&amp;')
  })

  it('names the same stylesheet the same way, twice', () => {
    const a = renderToString(<SharedStyle id="shop-cards" css={GRID} />)
    const b = renderToString(<SharedStyle id="shop-cards" css={GRID} />)
    expect(a).toEqual(b)
    expect(a).toContain('data-href="shop-cards-')
  })

  it('names two different stylesheets differently, even under one id', () => {
    // The case that matters: two product grids on one page whose breakpoints
    // differ, so their CSS differs. Sharing an href would serve one of them the
    // other's rules and there would be no error to notice.
    const a = renderToString(<SharedStyle id="shop-cards" css={GRID} />)
    const b = renderToString(<SharedStyle id="shop-cards" css={`${GRID}\n.d{}`} />)
    const href = (html: string) => /data-href="([^"]+)"/.exec(html)?.[1]
    expect(href(a)).not.toEqual(href(b))
  })

  it('renders nothing for an empty stylesheet', () => {
    expect(renderToString(<SharedStyle id="t" css="" />)).toEqual('')
  })

  it('is hoisted out of where it was written, and written once for two asks', () => {
    // The behaviour the whole thing rests on. React lifts the sheet out of the
    // markup it was declared in and emits it once, however many blocks asked.
    // Without `precedence` none of that happens and the href buys nothing, so this
    // is the test that would fail if somebody dropped the prop.
    const html = renderToString(
      <div>
        <SharedStyle id="shop-cards" css={GRID} />
        <p>a grid</p>
        <SharedStyle id="shop-cards" css={GRID} />
        <p>another grid</p>
      </div>,
    )
    expect(html.match(/<style/g) ?? []).toHaveLength(1)
    expect(html).toContain('data-precedence="module"')
    // Lifted clear of the div it was declared inside.
    expect(html.indexOf('<style')).toBeLessThan(html.indexOf('<div'))
  })
})
