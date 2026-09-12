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

beforeEach(() => {
  vi.clearAllMocks()
  queryRaw.mockResolvedValue([{ folderId: 'f1', originalName: 'oak-thumb.webp' }])
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
    findMany.mockResolvedValue([OLDEST])
    const result = await dedupeRenditions()
    expect(result.deleted).toBe(0)
    expect(deleteRow).not.toHaveBeenCalled()
  })
})
