import { describe, it, expect } from 'vitest'
import { containsBlock, withBlockPlaced } from './auto-place-blocks'

// This edits the document a site's header is made of, on a live site, without
// anybody watching. A wrong answer is a broken header on every page at once, so
// the decision half is pure and tested here and the writing half does nothing
// but persist what this returns.

const HEADER = {
  root: { props: {} },
  zones: {},
  content: [
    { type: 'Grid', props: { id: 'header-grid' } },
    { type: 'Group', props: { id: 'header-mobile-row' } },
  ],
}

describe('containsBlock', () => {
  it('finds a block in the top-level content', () => {
    expect(containsBlock({ content: [{ type: 'GoogleTag', props: {} }] }, 'GoogleTag')).toBe(true)
  })

  it('finds a block the owner has moved into a zone', () => {
    // The whole point of looking in zones: somebody who dragged the block
    // somewhere sensible must not be given a second copy.
    const moved = { content: [], zones: { 'header-grid:col1': [{ type: 'GoogleTag', props: {} }] } }
    expect(containsBlock(moved, 'GoogleTag')).toBe(true)
  })

  it('says no for a layout that has never had it', () => {
    expect(containsBlock(HEADER, 'GoogleTag')).toBe(false)
  })

  it('says no rather than throwing on the shapes a database hands back', () => {
    expect(containsBlock(null, 'GoogleTag')).toBe(false)
    expect(containsBlock(undefined, 'GoogleTag')).toBe(false)
    expect(containsBlock('not a document', 'GoogleTag')).toBe(false)
  })
})

describe('withBlockPlaced', () => {
  it('appends the block and leaves everything else exactly as it was', () => {
    const next = withBlockPlaced(HEADER, 'GoogleTag', { id: 'google-tag-auto' })
    expect(next).not.toBeNull()
    expect(next!.content).toHaveLength(3)
    expect(next!.content![2]).toEqual({ type: 'GoogleTag', props: { id: 'google-tag-auto' } })
    // The first two items, the root and the zones are untouched.
    expect(next!.content!.slice(0, 2)).toEqual(HEADER.content)
    expect(next!.root).toBe(HEADER.root)
    expect(next!.zones).toBe(HEADER.zones)
  })

  it('can place at the start when the module asks for it', () => {
    const next = withBlockPlaced(HEADER, 'GoogleTag', { id: 'google-tag-auto' }, 'start')
    expect(next!.content![0]!.type).toBe('GoogleTag')
  })

  it('never mutates the document it was given', () => {
    const before = JSON.stringify(HEADER)
    withBlockPlaced(HEADER, 'GoogleTag', { id: 'google-tag-auto' })
    expect(JSON.stringify(HEADER)).toBe(before)
  })

  it('declines when the block is already there, so re-running adds nothing', () => {
    const once = withBlockPlaced(HEADER, 'GoogleTag', { id: 'google-tag-auto' })!
    expect(withBlockPlaced(once, 'GoogleTag', { id: 'google-tag-auto' })).toBeNull()
  })

  it('declines when the owner has moved it into a zone', () => {
    const moved = { ...HEADER, zones: { 'header-grid:col1': [{ type: 'GoogleTag', props: {} }] } }
    expect(withBlockPlaced(moved, 'GoogleTag', { id: 'google-tag-auto' })).toBeNull()
  })

  it('declines rather than inventing a content array it does not understand', () => {
    // A layout row that is null, or holds something this code has never seen,
    // is somebody's live header. Guessing at its shape is not on.
    expect(withBlockPlaced(null, 'GoogleTag', {})).toBeNull()
    expect(withBlockPlaced({ root: {} }, 'GoogleTag', {})).toBeNull()
    expect(withBlockPlaced([], 'GoogleTag', {})).toBeNull()
    expect(withBlockPlaced('nonsense', 'GoogleTag', {})).toBeNull()
  })
})
