import { describe, expect, it } from 'vitest'
import { PageStore, type StoredPage } from './store'

const limits = { maxBytes: 1000, maxEntries: 100, freshForMs: 3600_000, staleGraceMs: 150_000 }

function page(key: string, size = 100, over: Partial<StoredPage> = {}): StoredPage {
  return {
    key,
    host: 'example.com',
    path: `/${key}`,
    query: '',
    status: 200,
    headers: [],
    body: Buffer.alloc(size),
    gzipped: true,
    renderedAt: 0,
    staleSince: null,
    lastHitAt: 0,
    ...over,
  }
}

describe('how long a copy may be served', () => {
  it('is fresh until something changes or the limit passes', () => {
    const store = new PageStore(limits)
    const held = page('a')
    expect(store.stateOf(held, 1000)).toBe('fresh')
    expect(store.stateOf(held, 3_599_999)).toBe('fresh')
    expect(store.stateOf(held, 3_600_000)).toBe('stale')
  })

  it('stops being fresh the moment a change is seen', () => {
    const store = new PageStore(limits)
    const held = page('a')
    store.set(held)
    store.markAllStale(5000)
    expect(store.stateOf(held, 5000)).toBe('stale')
  })

  it('can never be served past the grace period, however busy the site is', () => {
    const store = new PageStore(limits)
    const held = page('a')
    store.set(held)
    store.markAllStale(5000)
    expect(store.stateOf(held, 5000 + 150_000)).toBe('stale')
    expect(store.stateOf(held, 5000 + 150_001)).toBe('expired')
  })

  it('keeps the earliest change when more follow, so repeat writes cannot extend it', () => {
    const store = new PageStore(limits)
    const held = page('a')
    store.set(held)
    store.markAllStale(5000)
    store.markAllStale(100_000)
    expect(held.staleSince).toBe(5000)
    expect(store.stateOf(held, 160_000)).toBe('expired')
  })

  it('an entry replaced by a new render is fresh again', () => {
    const store = new PageStore(limits)
    store.set(page('a'))
    store.markAllStale(5000)
    store.set(page('a', 100, { renderedAt: 6000 }))
    const held = store.peek('a')
    expect(held && store.stateOf(held, 6001)).toBe('fresh')
  })
})

describe('what it costs in memory', () => {
  it('never exceeds its byte budget', () => {
    const store = new PageStore(limits)
    for (let i = 0; i < 50; i++) store.set(page(`p${i}`))
    expect(store.usedBytes).toBeLessThanOrEqual(1000)
    expect(store.size).toBe(10)
  })

  it('counts a replacement once', () => {
    const store = new PageStore(limits)
    store.set(page('a', 300))
    store.set(page('a', 200))
    expect(store.usedBytes).toBe(200)
  })

  it('never exceeds its entry budget', () => {
    const store = new PageStore({ ...limits, maxEntries: 3 })
    for (let i = 0; i < 10; i++) store.set(page(`p${i}`, 1))
    expect(store.size).toBe(3)
  })

  it('refuses a page larger than the whole budget rather than emptying itself', () => {
    const store = new PageStore(limits)
    store.set(page('small'))
    store.set(page('huge', 5000))
    expect(store.peek('huge')).toBeUndefined()
    expect(store.peek('small')).toBeDefined()
  })

  it('loses variation addresses and 404s before plain pages', () => {
    const store = new PageStore(limits)
    for (let i = 0; i < 5; i++) store.set(page(`plain${i}`))
    store.set(page('variation', 100, { query: '?width=1' }))
    store.set(page('missing', 100, { status: 404 }))
    for (let i = 0; i < 5; i++) store.set(page(`more${i}`))
    expect(store.peek('variation')).toBeUndefined()
    expect(store.peek('missing')).toBeUndefined()
    expect(store.peek('plain0')).toBeDefined()
  })

  it('keeps recently served pages over ones nobody came back for', () => {
    const store = new PageStore(limits)
    for (let i = 0; i < 10; i++) store.set(page(`p${i}`))
    const first = store.peek('p0')
    if (first) store.touch(first, 1)
    store.set(page('new'))
    expect(store.peek('p0')).toBeDefined()
    expect(store.peek('p1')).toBeUndefined()
  })
})
