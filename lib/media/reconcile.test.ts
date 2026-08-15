import { describe, it, expect } from 'vitest'
import { diffStorageAgainstRows, extractReferencedKeys, isOwnMediaKey, type ReconcileRow } from './reconcile'
import type { StoredObject } from './upload'

// The stakes here are one-sided. A missed orphan costs a little storage; a FALSE
// orphan is a file the admin is invited to delete, and nothing in the library
// points at it to object. So the cases below lean on "does not report an orphan
// it shouldn't" rather than on coverage counts.

const row = (key: string, sizeBytes: number, id = key): ReconcileRow => ({
  id,
  key,
  originalName: null,
  sizeBytes,
})
const obj = (key: string, sizeBytes: number): StoredObject => ({ key, sizeBytes })

describe('diffStorageAgainstRows', () => {
  it('reports nothing when every row matches its object exactly', () => {
    const d = diffStorageAgainstRows('B2', [row('media/a.webp', 100)], [obj('media/a.webp', 100)])
    expect(d.orphaned).toEqual([])
    expect(d.missing).toEqual([])
    expect(d.mismatched).toEqual([])
    expect(d.orphanedBytes).toBe(0)
  })

  it('calls an object with no row an orphan, and totals the bytes', () => {
    const d = diffStorageAgainstRows(
      'B2',
      [row('media/a.webp', 100)],
      [obj('media/a.webp', 100), obj('media/left-behind.png', 4_250_000)],
    )
    expect(d.orphaned.map((o) => o.key)).toEqual(['media/left-behind.png'])
    expect(d.orphanedBytes).toBe(4_250_000)
    expect(d.orphaned[0]?.provider).toBe('B2')
    expect(d.missing).toEqual([])
  })

  it('does not mistake a folder placeholder for an orphan', () => {
    // Some providers materialise a directory as a zero-byte object. Offering it
    // for deletion would be noise at best.
    const d = diffStorageAgainstRows('B2', [], [obj('media/shop/', 0)])
    expect(d.orphaned).toEqual([])
  })

  it('reports a row whose object has gone, without also calling it a mismatch', () => {
    const d = diffStorageAgainstRows('B2', [row('media/gone.webp', 100)], [])
    expect(d.missing.map((m) => m.key)).toEqual(['media/gone.webp'])
    expect(d.mismatched).toEqual([])
  })

  it('reports a recorded size that disagrees with the stored object', () => {
    // The real case: a row created from the browser's own file.size while the
    // object stored was a different length entirely.
    const d = diffStorageAgainstRows('B2', [row('media/chair.webp', 449_802)], [obj('media/chair.webp', 77_564)])
    expect(d.mismatched).toHaveLength(1)
    expect(d.mismatched[0]?.recordedBytes).toBe(449_802)
    expect(d.mismatched[0]?.storedBytes).toBe(77_564)
    expect(d.orphaned).toEqual([])
    expect(d.missing).toEqual([])
  })

  it('treats an empty bucket as every row missing, never as orphans', () => {
    const rows = [row('media/a.webp', 1), row('media/b.webp', 2)]
    const d = diffStorageAgainstRows('B2', rows, [])
    expect(d.missing).toHaveLength(2)
    expect(d.orphaned).toEqual([])
  })

  it('keeps an object the site is using out of the orphan list', () => {
    // The case that cost a live site: a module writes a 3D model's url straight
    // into its own table without minting a library row, so the object looks
    // unowned while a product page serves it.
    const used = 'media/shop/desks/impulse/3d/120cm.glb'
    const d = diffStorageAgainstRows('B2', [], [obj(used, 400_000), obj('media/spare.webp', 10)], (k) => k === used)
    expect(d.orphaned.map((o) => o.key)).toEqual(['media/spare.webp'])
    expect(d.claimed.map((o) => o.key)).toEqual([used])
    expect(d.claimedBytes).toBe(400_000)
    expect(d.orphanedBytes).toBe(10)
  })

  it('leaves a claimed object out of the orphan byte total', () => {
    const d = diffStorageAgainstRows('B2', [], [obj('media/a.webp', 500)], () => true)
    expect(d.orphaned).toEqual([])
    expect(d.orphanedBytes).toBe(0)
  })

  it('still calls a rowless object an orphan when no claim test is given', () => {
    const d = diffStorageAgainstRows('B2', [], [obj('media/a.webp', 500)])
    expect(d.orphaned.map((o) => o.key)).toEqual(['media/a.webp'])
    expect(d.claimed).toEqual([])
  })

  it('matches keys exactly, so a shared prefix is not treated as the same file', () => {
    const d = diffStorageAgainstRows(
      'B2',
      [row('media/photo.webp', 10)],
      [obj('media/photo.webp', 10), obj('media/photo.webp.bak', 10)],
    )
    expect(d.orphaned.map((o) => o.key)).toEqual(['media/photo.webp.bak'])
    expect(d.missing).toEqual([])
  })
})

describe('extractReferencedKeys', () => {
  it('finds a key inside a url, a bare key and a JSON blob', () => {
    const keys = extractReferencedKeys([
      'https://media.example.co.uk/media/shop/chair.webp',
      'media/shop/desk/3d/120cm.glb',
      '{"model":"media/shop/desk/3d/140cm.glb","alt":"a desk"}',
    ].join('\n'))
    expect(keys.has('media/shop/chair.webp')).toBe(true)
    expect(keys.has('media/shop/desk/3d/120cm.glb')).toBe(true)
    expect(keys.has('media/shop/desk/3d/140cm.glb')).toBe(true)
  })

  it('drops a signed url\'s query so the key still matches', () => {
    const keys = extractReferencedKeys('https://x/media/a.glb?Authorization=abc123&Expires=1')
    expect(keys.has('media/a.glb')).toBe(true)
  })

  it('records the decoded form of an escaped key as well as the raw one', () => {
    const keys = extractReferencedKeys('https://x/media/shop/my%20chair.webp')
    expect(keys.has('media/shop/my chair.webp')).toBe(true)
    expect(keys.has('media/shop/my%20chair.webp')).toBe(true)
  })

  it('survives a malformed escape rather than throwing the whole scan away', () => {
    const keys = extractReferencedKeys('media/100%discount.webp')
    expect(keys.has('media/100%discount.webp')).toBe(true)
  })

  it('finds nothing in content that mentions no media', () => {
    expect(extractReferencedKeys('a page about office chairs').size).toBe(0)
  })
})

describe('isOwnMediaKey', () => {
  it('accepts B2 legacy prefix-less keys and rejects unrelated objects', () => {
    expect(isOwnMediaKey('B2', 'media/a.webp')).toBe(true)
    expect(isOwnMediaKey('B2', 'backups/dump.sql')).toBe(false)
  })

  it('namespaces every other provider by its own name', () => {
    expect(isOwnMediaKey('R2', 'media/R2/a.webp')).toBe(true)
    expect(isOwnMediaKey('R2', 'media/a.webp')).toBe(false)
  })
})
