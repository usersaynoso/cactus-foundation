import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { puckConfig } from '@/lib/puck/config'

// Vertical space between blocks, and one column of a grid sitting lower than its
// neighbours. Both are things an owner could not do at all until now: the core
// `padding` field is LEFT AND RIGHT ONLY, and every block that wanted air around
// it hard-coded `1.5rem` where nobody could reach it. On a page that reads as
// generous. In the strip at the foot of a PDF, where the whole footer is a few
// millimetres tall, a 1.5rem hole under a rule is most of the footer.
//
// The defaults are the whole risk here. Every one of them is the figure the
// block hard-coded, so a layout somebody published last year renders the same
// markup today - which is what these tests are mostly checking.

const render = (type: string, props: Record<string, unknown>) => {
  const component = (puckConfig.components as Record<string, any>)[type]
  const Render = component.render
  return renderToStaticMarkup(<Render {...component.defaultProps} id={`${type}-1`} {...props} />)
}

describe('Divider spacing', () => {
  it('leaves the old 1.5rem above and below when nobody has touched it', () => {
    const html = render('Divider', {})
    expect(html).toContain('margin-top:1.5rem')
    expect(html).toContain('margin-bottom:1.5rem')
  })

  it('closes the gap right up when asked', () => {
    const html = render('Divider', { spaceAbove: 'none', spaceBelow: 'none' })
    expect(html).toContain('margin-top:0')
    expect(html).toContain('margin-bottom:0')
  })

  it('takes an exact length over the menu', () => {
    const html = render('Divider', { spaceBelow: 'lg', spaceBelowPx: '3px' })
    expect(html).toContain('margin-bottom:3px')
    expect(html).not.toContain('margin-bottom:2.5rem')
  })

  it('keeps the exact box out of it when it is blank', () => {
    const html = render('Divider', { spaceBelow: 'sm', spaceBelowPx: '   ' })
    expect(html).toContain('margin-bottom:0.75rem')
  })
})

describe('Text block spacing', () => {
  it('keeps the 1.5rem below that it always had', () => {
    expect(render('TextBlock', { content: 'x' })).toContain('margin-bottom:1.5rem')
  })

  it('can be closed up', () => {
    const html = render('TextBlock', { content: 'x', spaceBelow: 'none' })
    expect(html).toContain('margin-bottom:0')
    expect(html).not.toContain('margin-bottom:1.5rem')
  })
})

describe('Rich text spacing', () => {
  it('adds no margin of its own by default, as before', () => {
    const html = render('RichTextBlock', { content: '<p>x</p>' })
    expect(html).toContain('margin-top:0')
    expect(html).toContain('margin-bottom:0')
  })

  it('publishes the paragraph gap as a custom property only when set', () => {
    expect(render('RichTextBlock', { content: '<p>x</p>' })).not.toContain('--puck-richtext-p-space')
    // globals.css reads this with 1em as the fallback, so blank stays 1em.
    expect(render('RichTextBlock', { content: '<p>x</p>', paraSpace: '2px' }))
      .toContain('--puck-richtext-p-space:2px')
  })
})

describe('per-column vertical alignment on a grid', () => {
  const grid = (props: Record<string, unknown>) =>
    render('Grid3', { col1: () => null, col2: () => null, col3: () => null, ...props })

  it('sets nothing per column until a column asks', () => {
    expect(grid({})).not.toContain('align-self')
  })

  it('drops one column to the bottom without moving the others', () => {
    const html = grid({ col3VAlign: 'end' })
    expect(html).toContain('align-self:end')
    // One column, not three: the grid-wide "Vertical align" is still stretch.
    expect(html.match(/align-self:/g)).toHaveLength(1)
    expect(html).toContain('align-items:stretch')
  })

  it('lets a sticky column keep the alignment it needs to travel', () => {
    // align-self: start is what gives a pinned column somewhere to scroll to.
    // A per-column setting must not take it away.
    const html = grid({ col2Sticky: 'on', col2VAlign: 'end' })
    expect(html).toContain('align-self:start')
    expect(html).not.toContain('align-self:end')
  })
})
