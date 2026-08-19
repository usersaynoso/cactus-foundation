import { describe, it, expect } from 'vitest'
import { extractReferenceTokens, isMediaInContent, isMediaInUse, type MediaUsageIndex } from '@/lib/media/references'

function index(haystack: string, ids: string[] = [], degraded = false): MediaUsageIndex {
  const lowered = haystack.toLowerCase()
  return {
    referencedIds: new Set(ids),
    haystack: lowered,
    referenced: extractReferenceTokens(lowered),
    degraded,
  }
}

const URL = 'https://media.deskwell.co.uk/media/shop/office-chairs/luna/kc1234_1.webp'
const KEY = 'media/shop/office-chairs/luna/kc1234_1.webp'
const ID = 'cms1fhpyf0003ju046eezawf2'
const item = { id: ID, key: KEY, url: URL }

describe('extractReferenceTokens', () => {
  it('pulls a url out of builder JSON, quotes and all', () => {
    const tokens = extractReferenceTokens(`{"bgImage":"${URL}","x":1}`)
    expect(tokens.has(URL)).toBe(true)
  })

  it('pulls a bare storage key out', () => {
    expect(extractReferenceTokens(`{"key":"${KEY}"}`).has(KEY)).toBe(true)
  })

  it('drops a cache-busting query so the plain url still matches', () => {
    expect(extractReferenceTokens(`"${URL}?v=8"`).has(URL)).toBe(true)
  })

  it('records the decoded spelling of an encoded key', () => {
    const encoded = 'media/shop/a%20b/c.webp'
    const tokens = extractReferenceTokens(encoded)
    expect(tokens.has('media/shop/a b/c.webp')).toBe(true)
  })

  it('finds a url wrapped in markdown brackets', () => {
    expect(extractReferenceTokens(`![alt](${URL})`).has(URL)).toBe(true)
  })

  it('finds an id quoted as a Puck prop', () => {
    expect(extractReferenceTokens(`{"mediaId":"${ID}"}`).has(ID)).toBe(true)
  })
})

describe('isMediaInContent', () => {
  it('matches on url, key or id alone', () => {
    expect(isMediaInContent(item, index(`"${URL}"`))).toBe(true)
    expect(isMediaInContent(item, index(`"${KEY}"`))).toBe(true)
    expect(isMediaInContent(item, index(`"${ID}"`))).toBe(true)
  })

  it('says no when nothing mentions it', () => {
    expect(isMediaInContent(item, index('{"bgImage":"https://example.com/x.png"}'))).toBe(false)
  })

  it('is not fooled by a url that merely shares a prefix', () => {
    const other = 'https://media.deskwell.co.uk/media/shop/office-chairs/luna/kc1234_10.webp'
    expect(isMediaInContent(item, index(`"${other}"`))).toBe(false)
  })

  it('falls back to a substring scan for a key extraction cannot capture', () => {
    // A legacy key with a space in it: the token scan stops at whitespace, so
    // only the fallback can find it, and "unused" is the verdict that arms a
    // bulk delete.
    const odd = { id: 'x'.repeat(25), key: 'media/shop/old name/pic.webp', url: '' }
    expect(isMediaInContent(odd, index('{"src":"media/shop/old name/pic.webp"}'))).toBe(true)
  })
})

describe('isMediaInUse', () => {
  it('treats everything as in use when the index is degraded', () => {
    expect(isMediaInUse(item, index('', [], true))).toBe(true)
  })

  it('counts a foreign-key reference even with an empty haystack', () => {
    expect(isMediaInUse(item, index('', [ID]))).toBe(true)
  })

  it('is false only when neither the ids nor the content mention it', () => {
    expect(isMediaInUse(item, index('nothing here'))).toBe(false)
  })
})
