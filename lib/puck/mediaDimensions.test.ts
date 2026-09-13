import { beforeEach, describe, expect, it, vi } from 'vitest'

// The lookup sits on the render path of every info page, so two things are pinned:
// that a page with no image blocks costs no query at all, and that the walk finds
// pictures wherever Puck nests a block - zones, slots, a layout's own tree - since a
// block it misses silently keeps shifting the page.

const findMany = vi.fn()
vi.mock('@/lib/db/prisma', () => ({ prisma: { media: { findMany: (...args: unknown[]) => findMany(...args) } } }))

const HERO = 'https://media.example.com/hero.webp'
const ABOUT = 'https://media.example.com/about.webp'
const BASE = { lazyImages: true, loadedFonts: [] }

beforeEach(() => {
  findMany.mockReset()
  vi.resetModules()
})

describe('collectDimensionedImageUrls', () => {
  it('finds image blocks in content, zones, slots and a second tree', async () => {
    const { collectDimensionedImageUrls } = await import('./mediaDimensions')
    const page = {
      content: [
        { type: 'Heading', props: { id: 'h', text: 'Hello' } },
        {
          type: 'Columns',
          props: { id: 'c', left: [{ type: 'ImageChipPanel', props: { id: 'hero', mediaUrl: HERO } }] },
        },
      ],
      zones: { 'c:right': [{ type: 'ImageBlock', props: { id: 'about', mediaUrl: ABOUT } }] },
    }
    const layout = { content: [{ type: 'ImageBlock', props: { id: 'dup', mediaUrl: HERO } }] }
    expect(collectDimensionedImageUrls([page, layout]).sort()).toEqual([ABOUT, HERO].sort())
  })

  it('ignores other blocks with a mediaUrl, empty urls and missing trees', async () => {
    const { collectDimensionedImageUrls } = await import('./mediaDimensions')
    const page = {
      content: [
        { type: 'Card', props: { mediaUrl: HERO } },
        { type: 'ImageBlock', props: { mediaUrl: '' } },
        { type: 'ImageBlock', props: {} },
      ],
    }
    expect(collectDimensionedImageUrls([page, null, undefined])).toEqual([])
  })
})

describe('withMediaDimensions', () => {
  it('asks the database nothing when no image block is present', async () => {
    const { withMediaDimensions } = await import('./mediaDimensions')
    const out = await withMediaDimensions(Promise.resolve(BASE), [{ content: [{ type: 'Heading', props: {} }] }])
    expect(out).toEqual(BASE)
    expect(findMany).not.toHaveBeenCalled()
  })

  it('adds the recorded sizes in one query, skipping rows with no size', async () => {
    findMany.mockResolvedValue([
      { url: HERO, width: 800, height: 450 },
      { url: HERO, width: 10, height: 10 },
      { url: ABOUT, width: null, height: null },
    ])
    const { withMediaDimensions } = await import('./mediaDimensions')
    const page = {
      content: [
        { type: 'ImageChipPanel', props: { mediaUrl: HERO } },
        { type: 'ImageBlock', props: { mediaUrl: ABOUT } },
      ],
    }
    const out = await withMediaDimensions(BASE, [page])
    expect(findMany).toHaveBeenCalledTimes(1)
    expect(findMany.mock.calls[0]?.[0]).toMatchObject({ where: { url: { in: [HERO, ABOUT] } } })
    expect(out).toEqual({ ...BASE, mediaDimensions: { [HERO]: { width: 800, height: 450 } } })
  })

  it('renders without reserved space rather than failing when the lookup does', async () => {
    findMany.mockRejectedValue(new Error('database having a moment'))
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { withMediaDimensions } = await import('./mediaDimensions')
    const out = await withMediaDimensions(BASE, [{ content: [{ type: 'ImageBlock', props: { mediaUrl: HERO } }] }])
    expect(out).toEqual(BASE)
  })
})
