import { describe, it, expect } from 'vitest'
import { exactBaseName, nanoidLabel, stripExtension, isExactNameKey, MAX_EXACT_BASENAME } from './keys'

// The promise the exact form makes is "names the caller made unique stay unique
// as keys". That is the whole reason the form exists, and breaking it does not
// throw - it silently points two Media rows at one blob, so storage overwrites
// one image with another. It is asserted directly here rather than eyeballed.

// A real pair from the bug: a 51-character product slug, its own second image,
// and one of its variants. Under the old 40-character clip all three produced
// "chiro-plus-high-back-ergonomic-posture-o" and shared a single key.
const PRODUCT = 'chiro-plus-high-back-ergonomic-posture-office-chair'
const LONG_NAMES = [
  `${PRODUCT}1`,
  `${PRODUCT}2`,
  `${PRODUCT}-none-with-headrest-myrrh-green-fabric1`,
  `${PRODUCT}-none-with-headrest-black-fabric1`,
]

describe('exactBaseName', () => {
  it('keeps a short name verbatim, so the url reads as the caller named it', () => {
    expect(exactBaseName('blue-mug1')).toBe('blue-mug1')
    expect(exactBaseName('blue-mug1.jpeg')).toBe('blue-mug1')
  })

  it('sanitises to a lower-case, url-safe basename', () => {
    expect(exactBaseName('Blue Mug 1.PNG')).toBe('blue-mug-1')
  })

  it('gives distinct keys to names that differ only past the old 40-char clip', () => {
    const bases = LONG_NAMES.map((n) => exactBaseName(n))
    expect(new Set(bases).size).toBe(LONG_NAMES.length)
  })

  it('never exceeds the cap, however long the name', () => {
    for (const name of [...LONG_NAMES, 'x'.repeat(5000)]) {
      expect(exactBaseName(name).length).toBeLessThanOrEqual(MAX_EXACT_BASENAME)
    }
  })

  it('is deterministic, so re-filing an already-filed image is a no-op', () => {
    const name = LONG_NAMES[0]
    expect(exactBaseName(name)).toBe(exactBaseName(name))
  })

  it('keeps a clipped name readable rather than reducing it to a hash', () => {
    expect(exactBaseName(LONG_NAMES[2]).startsWith('chiro-plus-high-back-ergonomic')).toBe(true)
  })

  it('clips exactly at the boundary without a hash, and hashes just past it', () => {
    const atCap = 'a'.repeat(MAX_EXACT_BASENAME)
    expect(exactBaseName(atCap)).toBe(atCap)
    expect(exactBaseName('a'.repeat(MAX_EXACT_BASENAME + 1))).not.toBe(atCap)
  })

  it('has no usable name to work with, so defers to the nanoid form', () => {
    expect(exactBaseName(undefined)).toBe('')
    expect(exactBaseName('')).toBe('')
  })
})

describe('nanoidLabel', () => {
  it('clips the decorative label short - the nanoid carries uniqueness here', () => {
    expect(nanoidLabel(`${PRODUCT}1.jpeg`)).toBe('-chiro-plus-high-back-ergonomic-posture-o')
  })

  it('prefixes a dash only when something survives sanitising', () => {
    expect(nanoidLabel('logo.png')).toBe('-logo')
    expect(nanoidLabel(undefined)).toBe('')
  })
})

// Telling the forms apart is what lets a crop or a reshape land back on the key
// it came from. Get it wrong for an exact-named image and the derive renames the
// file, strands every reference held outside Puck content, and then deletes the
// blob under them - which is exactly how a live product's images disappeared.
describe('isExactNameKey', () => {
  const FOLDER = 'media/shop/ergonomic-chairs/chiro-plus-high-back-ergonomic-posture-office-chair'

  it('recognises the key the shop filed a product image under', () => {
    expect(isExactNameKey(`${FOLDER}/${PRODUCT}1.jpeg`, `${PRODUCT}1`)).toBe(true)
  })

  it('recognises an exact key whose name was long enough to be hashed', () => {
    const name = 'x'.repeat(MAX_EXACT_BASENAME + 40)
    expect(isExactNameKey(`media/B2/${exactBaseName(name)}.png`, name)).toBe(true)
  })

  it('rejects the nanoid form, where the basename is not the name at all', () => {
    expect(isExactNameKey(`${FOLDER}/B0lqdWcxQZ5VPeo8AHgqN-chiro-plus-high-back-ergonomic-posture-o.jpeg`, `${PRODUCT}1`)).toBe(false)
  })

  it('rejects a key that merely contains the name', () => {
    expect(isExactNameKey(`media/B2/${PRODUCT}1/other.jpeg`, `${PRODUCT}1`)).toBe(false)
    expect(isExactNameKey(`media/B2/${PRODUCT}1-2.jpeg`, `${PRODUCT}1`)).toBe(false)
  })

  it('holds for a name the sanitiser rewrites, so a display name still matches', () => {
    expect(isExactNameKey('media/B2/blue-mug-1.png', 'Blue Mug 1.png')).toBe(true)
  })

  it('has no name to compare against, so cannot be the exact form', () => {
    expect(isExactNameKey('media/B2/anything.png', null)).toBe(false)
    expect(isExactNameKey('media/B2/anything.png', '')).toBe(false)
  })
})

describe('stripExtension', () => {
  it('drops only the final extension', () => {
    expect(stripExtension('logo.png')).toBe('logo')
    expect(stripExtension('logos.v2.png')).toBe('logos.v2')
    expect(stripExtension('noextension')).toBe('noextension')
  })
})
