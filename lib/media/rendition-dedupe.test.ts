import { describe, it, expect, vi, beforeEach } from 'vitest'

const queryRaw = vi.fn()
const findMany = vi.fn()
const deleteRow = vi.fn()
const count = vi.fn()
const takeOverMediaReferences = vi.fn()
const deleteMedia = vi.fn()

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $queryRaw: (...a: unknown[]) => queryRaw(...a),
    media: {
      findMany: (...a: unknown[]) => findMany(...a),
      delete: (...a: unknown[]) => deleteRow(...a),
      count: (...a: unknown[]) => count(...a),
    },
  },
}))
vi.mock('@/lib/media/organise', () => ({
  takeOverMediaReferences: (...a: unknown[]) => takeOverMediaReferences(...a),
}))
vi.mock('@/lib/media/upload', () => ({ deleteMedia: (...a: unknown[]) => deleteMedia(...a) }))

const { dedupeRenditions } = await import('@/lib/media/rendition-dedupe')

// Three rows of one name in one folder: one picture, three files. The oldest is
// the one every lookup in renditions.ts already resolves to.
const OLDEST = { id: 'keep', key: 'shop/oak-thumb.webp', url: 'https://cdn/oak-thumb.webp', provider: 'B2', folderId: 'f1', originalName: 'oak-thumb.webp', createdAt: new Date('2026-01-01') }
const MIDDLE = { ...OLDEST, id: 'dupe1', key: 'shop/oak-thumb-2.webp', url: 'https://cdn/oak-thumb-2.webp', createdAt: new Date('2026-01-02') }
const NEWEST = { ...OLDEST, id: 'dupe2', key: 'shop/oak-thumb-3.webp', url: 'https://cdn/oak-thumb-3.webp', createdAt: new Date('2026-01-03') }

// The lib asks two raw questions: "which groups are duplicated?" first, then
// "which rows are in this group, best survivor first?". The second returns ids
// only; the full rows come back through findMany.
function wireGroup(order: Array<{ id: string }>) {
  let call = 0
  queryRaw.mockImplementation(async () => {
    call += 1
    return call === 1 ? [{ folderId: 'f1', originalName: 'oak-thumb.webp' }] : order.map((r) => ({ id: r.id }))
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  wireGroup([OLDEST, MIDDLE, NEWEST])
  findMany.mockResolvedValue([OLDEST, MIDDLE, NEWEST])
  deleteRow.mockResolvedValue({})
  count.mockResolvedValue(0)
  deleteMedia.mockResolvedValue(undefined)
  takeOverMediaReferences.mockResolvedValue(undefined)
})

describe('dedupeRenditions', () => {
  it('keeps the OLDEST row and deletes the rest', async () => {
    // Not a free choice: every lookup orders by createdAt ascending and takes the
    // first, so keeping the oldest means nothing on any page changes.
    const result = await dedupeRenditions()

    expect(result.deleted).toBe(2)
    expect(deleteRow).toHaveBeenCalledWith({ where: { id: 'dupe1' } })
    expect(deleteRow).toHaveBeenCalledWith({ where: { id: 'dupe2' } })
    expect(deleteRow).not.toHaveBeenCalledWith({ where: { id: 'keep' } })
  })

  it('hands every reference over BEFORE the row or the blob goes', async () => {
    await dedupeRenditions()

    expect(takeOverMediaReferences).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'dupe1' }),
      expect.objectContaining({ id: 'keep' }),
    )
    const [takeoverAt] = takeOverMediaReferences.mock.invocationCallOrder
    const [rowDeleteAt] = deleteRow.mock.invocationCallOrder
    const [blobDeleteAt] = deleteMedia.mock.invocationCallOrder
    expect(takeoverAt).toBeDefined()
    expect(rowDeleteAt).toBeDefined()
    expect(blobDeleteAt).toBeDefined()
    // References, then the row, then the bytes. A row whose blob has gone is a
    // broken picture; an orphaned blob is just pennies.
    expect(takeoverAt as number).toBeLessThan(rowDeleteAt as number)
    expect(rowDeleteAt as number).toBeLessThan(blobDeleteAt as number)
  })

  it('never deletes bytes another live row still answers with', async () => {
    // Two rows sharing one key is not supposed to happen - and is exactly the case
    // where deleting "the duplicate" takes the survivor's picture with it.
    count.mockResolvedValue(1)
    const result = await dedupeRenditions()

    expect(deleteMedia).not.toHaveBeenCalled()
    expect(result.blobsDeleted).toBe(0)
    expect(result.kept).toBe(2)
  })

  it('deletes nothing at all on a dry run', async () => {
    const result = await dedupeRenditions({ dryRun: true })

    expect(result.deleted).toBe(2)
    expect(takeOverMediaReferences).not.toHaveBeenCalled()
    expect(deleteRow).not.toHaveBeenCalled()
    expect(deleteMedia).not.toHaveBeenCalled()
  })

  it('leaves the whole group alone when a takeover fails', async () => {
    takeOverMediaReferences.mockRejectedValue(new Error('storage had a moment'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await dedupeRenditions()

    // Nothing deleted: the rows stay, still serving, and the next run tries again.
    expect(deleteRow).not.toHaveBeenCalled()
    expect(deleteMedia).not.toHaveBeenCalled()
    expect(result.kept).toBe(2)
    warn.mockRestore()
  })

  it('does nothing for a group that is no longer duplicated', async () => {
    wireGroup([OLDEST])
    findMany.mockResolvedValue([OLDEST])
    const result = await dedupeRenditions()
    expect(result.deleted).toBe(0)
    expect(deleteRow).not.toHaveBeenCalled()
  })

  it('keeps the PLAINLY-NAMED row even when a "(1)" sibling is older', async () => {
    // The survivor has to be the row a lookup can find. Every lookup matches
    // `originalName` against the name derived from the original's key - the plain
    // form, never " (1)" - so keeping an older parenthesised row would leave the
    // group with nothing findable, and every one of those pictures would quietly
    // fall back to drawing its full-size original. Age only settles ties.
    const OLD_PAREN = { ...OLDEST, id: 'paren', originalName: 'oak-thumb (1).webp', key: 'shop/oak-thumb-1.webp', url: 'https://cdn/oak-thumb-1.webp', createdAt: new Date('2025-01-01') }
    const PLAIN_NEWER = { ...OLDEST, id: 'plain', createdAt: new Date('2026-06-01') }
    // The SQL orders plain-name-first, so that is the order the lib receives.
    wireGroup([PLAIN_NEWER, OLD_PAREN])
    findMany.mockResolvedValue([OLD_PAREN, PLAIN_NEWER])

    const result = await dedupeRenditions()

    expect(deleteRow).toHaveBeenCalledWith({ where: { id: 'paren' } })
    expect(deleteRow).not.toHaveBeenCalledWith({ where: { id: 'plain' } })
    expect(takeOverMediaReferences).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'paren' }),
      expect.objectContaining({ id: 'plain' }),
    )
    expect(result.deleted).toBe(1)
  })
})
