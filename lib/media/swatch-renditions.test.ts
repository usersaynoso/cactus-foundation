import { describe, it, expect } from 'vitest'
import {
  formatSwatchFileSize,
  describeSwatchFile,
  describeSwatchRenditions,
  SWATCH_SMALL_MAX_PX,
  SWATCH_TINY_MAX_PX,
  type SwatchFileInfo,
} from '@/lib/media/swatch-renditions'

const FULL = 'https://cdn.example/oak.jpg'
const SMALL = 'https://cdn.example/oak-small.webp'
const TINY = 'https://cdn.example/oak-tiny.webp'

const files = (m: Record<string, SwatchFileInfo>) => m
const info = (bytes: number, width: number | null = null, height: number | null = null): SwatchFileInfo => ({ bytes, width, height })

describe('formatSwatchFileSize', () => {
  it('counts in the units an owner would', () => {
    expect(formatSwatchFileSize(512)).toBe('512 B')
    expect(formatSwatchFileSize(40 * 1024)).toBe('40 KB')
    expect(formatSwatchFileSize(3 * 1024 * 1024)).toBe('3.0 MB')
  })
})

describe('describeSwatchFile', () => {
  it('says the dimensions where the library has measured them', () => {
    expect(describeSwatchFile(info(40 * 1024, 400, 400))).toBe('40 KB, 400 x 400')
  })
  it('gives weight alone where it has not', () => {
    expect(describeSwatchFile(info(40 * 1024))).toBe('40 KB')
  })
  it('shrugs honestly about a picture it has never seen', () => {
    expect(describeSwatchFile(undefined)).toContain('not in the media library')
  })
})

describe('describeSwatchRenditions', () => {
  it('gives three boxes, in size order', () => {
    const notes = describeSwatchRenditions(FULL, SMALL, TINY, files({}))
    expect(notes.boxes.map((b) => b.rendition)).toEqual(['full', 'small', 'tiny'])
  })

  it('draws the tiny copy on listings and the small copy on the product page when both exist', () => {
    const notes = describeSwatchRenditions(FULL, SMALL, TINY, files({
      [FULL]: info(900_000, 2000, 2000),
      [SMALL]: info(42 * 1024, 400, 400),
      [TINY]: info(5 * 1024, 128, 128),
    }))
    expect(notes.usedOnProductPage).toBe('small')
    expect(notes.usedOnListings).toBe('tiny')
    // The full picture is in use nowhere once both copies exist, and the screen
    // says so rather than leaving an owner to infer it from an absent ring.
    const [full, small, tiny] = notes.boxes
    expect(full.inUse).toBe(false)
    expect(full.detail).toContain('Nothing on the storefront draws this one now')
    expect(small.inUse).toBe(true)
    expect(tiny.inUse).toBe(true)
    expect(tiny.detail).toContain('5 KB, 128 x 128')
  })

  it('falls back a rung at a time', () => {
    const onlySmall = describeSwatchRenditions(FULL, SMALL, null, files({ [FULL]: info(900_000, 2000, 2000) }))
    expect(onlySmall.usedOnListings).toBe('small')
    expect(onlySmall.boxes[2].detail).toContain('the small copy')

    const neither = describeSwatchRenditions(FULL, null, null, files({ [FULL]: info(900_000, 2000, 2000) }))
    expect(neither.usedOnListings).toBe('full')
    expect(neither.usedOnProductPage).toBe('full')
    expect(neither.boxes[0].inUse).toBe(true)
  })

  it('says a copy is wanted when the original is over a cap', () => {
    const notes = describeSwatchRenditions(FULL, null, null, files({ [FULL]: info(900_000, 2000, 2000) }))
    expect(notes.boxes[1].verdict).toBe('wants-copy')
    expect(notes.boxes[2].verdict).toBe('wants-copy')
    expect(notes.boxes[2].detail).toContain('Make copies')
  })

  it('judges each copy against its own cap', () => {
    // Inside the small cap, outside the tiny one: no small copy is worth making,
    // a tiny one very much is.
    const between = info(20 * 1024, SWATCH_SMALL_MAX_PX - 100, SWATCH_SMALL_MAX_PX - 100)
    const notes = describeSwatchRenditions(FULL, null, null, files({ [FULL]: between }))
    expect(notes.boxes[1].verdict).toBe('small-enough')
    expect(notes.boxes[2].verdict).toBe('wants-copy')
  })

  it('leaves an already-tiny original alone', () => {
    const notes = describeSwatchRenditions(FULL, null, null, files({
      [FULL]: info(3 * 1024, SWATCH_TINY_MAX_PX, SWATCH_TINY_MAX_PX),
    }))
    expect(notes.boxes[1].verdict).toBe('small-enough')
    expect(notes.boxes[2].verdict).toBe('small-enough')
  })

  it('will not promise either way about a light picture it has never measured', () => {
    const notes = describeSwatchRenditions(FULL, null, null, files({ [FULL]: info(9 * 1024) }))
    expect(notes.boxes[1].verdict).toBe('maybe-small-enough')
    expect(notes.boxes[2].verdict).toBe('maybe-small-enough')
  })

  it('says there is nothing to shrink when the picture is not a library item', () => {
    const notes = describeSwatchRenditions('https://elsewhere.example/oak.jpg', null, null, files({}))
    expect(notes.boxes[1].verdict).toBe('not-in-library')
    expect(notes.boxes[2].detail).toContain('not in the media library')
  })

  it('tells an empty row what each box is for rather than leaving it blank', () => {
    const notes = describeSwatchRenditions(null, null, null, files({}))
    expect(notes.boxes.every((b) => b.verdict === 'no-picture')).toBe(true)
    expect(notes.boxes[0].detail).toContain('drop an image here')
    expect(notes.boxes[1].detail).toContain("product page's option swatches")
    expect(notes.boxes[2].detail).toContain('category cards and filter lists')
    expect(notes.boxes.every((b) => !b.inUse)).toBe(true)
  })
})
