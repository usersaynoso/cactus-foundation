import { describe, it, expect } from 'vitest'
import { diffStorageAgainstRows, isOwnMediaKey, type ReconcileRow } from './reconcile'
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
