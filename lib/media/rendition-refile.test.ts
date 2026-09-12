import { describe, it, expect, vi, beforeEach } from 'vitest'

const mediaFindMany = vi.fn()
const mediaCount = vi.fn()
const folderFindMany = vi.fn()
const getOrCreateChildFolder = vi.fn()
const moveOrRenameMedia = vi.fn()

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    media: {
      findMany: (...a: unknown[]) => mediaFindMany(...a),
      count: (...a: unknown[]) => mediaCount(...a),
    },
    folder: { findMany: (...a: unknown[]) => folderFindMany(...a) },
  },
}))
vi.mock('@/lib/media/organise', () => ({
  cleanFolderName: (name: string) => name,
  getOrCreateChildFolder: (...a: unknown[]) => getOrCreateChildFolder(...a),
  moveOrRenameMedia: (...a: unknown[]) => moveOrRenameMedia(...a),
}))

const { refileRenditionsIntoThumbFolders } = await import('@/lib/media/rendition-refile')

// A folder holding one photograph and the small copy of it. The copy is named
// after the ORIGINAL's key, which is the whole basis on which it is recognised.
const ORIGINAL = { id: 'm1', key: 'shop/tables/oak.png', originalName: 'oak.png', mimeType: 'image/png' }
const COPY = { id: 'r1', key: 'shop/tables/id9-oak-thumb.webp', originalName: 'oak-thumb.webp', mimeType: 'image/webp' }

beforeEach(() => {
  vi.clearAllMocks()
  folderFindMany.mockResolvedValue([{ id: 'f1', name: 'oak-table' }])
  mediaFindMany.mockResolvedValue([ORIGINAL, COPY])
  getOrCreateChildFolder.mockResolvedValue('f1-thumb')
  moveOrRenameMedia.mockResolvedValue({})
})

describe('refileRenditionsIntoThumbFolders', () => {
  it('moves a copy into its folder\'s thumb child', async () => {
    const result = await refileRenditionsIntoThumbFolders({ after: 'f0' })

    expect(getOrCreateChildFolder).toHaveBeenCalledWith('f1', 'thumb')
    expect(moveOrRenameMedia).toHaveBeenCalledWith('r1', {
      targetFolderId: 'f1-thumb',
      collision: 'suffix',
      // A copy has no copies of its own, and asking would be three queries per
      // file across tens of thousands of them.
      carryRenditions: false,
    })
    expect(result.moved).toBe(1)
    // The original stays exactly where it is. Only the copy moves.
    expect(moveOrRenameMedia).toHaveBeenCalledTimes(1)
  })

  it('leaves a webp alone when no picture in the folder would name a copy that', async () => {
    // Somebody's own file that happens to end in -thumb.webp. Recognising copies
    // by the tail alone would have swept this into a folder it does not belong in.
    mediaFindMany.mockResolvedValue([
      { id: 'm2', key: 'shop/tables/walnut.png', originalName: 'walnut.png', mimeType: 'image/png' },
      COPY,
    ])
    const result = await refileRenditionsIntoThumbFolders({ after: 'f0' })

    expect(moveOrRenameMedia).not.toHaveBeenCalled()
    // And no folder is conjured for a folder that had nothing to tidy.
    expect(getOrCreateChildFolder).not.toHaveBeenCalled()
    expect(result.moved).toBe(0)
  })

  it('never reads a thumb folder as a source, so a second run is free', async () => {
    await refileRenditionsIntoThumbFolders({ after: 'f0' })
    const [args] = folderFindMany.mock.calls
    expect((args?.[0] as { where: { name: unknown } }).where.name).toEqual({ not: 'thumb' })
  })

  it('sweeps the library root on the first pass and not on a resumed one', async () => {
    mediaFindMany.mockResolvedValue([])
    folderFindMany.mockResolvedValue([])

    const first = await refileRenditionsIntoThumbFolders()
    // The root has no id of its own to resume from, so it is done once, up front -
    // and it is where a copy made before its original was filed anywhere ends up.
    expect(first.foldersSeen).toBe(1)
    expect(mediaFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { folderId: null } }))

    vi.clearAllMocks()
    mediaFindMany.mockResolvedValue([])
    folderFindMany.mockResolvedValue([])
    const resumed = await refileRenditionsIntoThumbFolders({ after: 'f0' })
    expect(resumed.foldersSeen).toBe(0)
  })

  it('reports the last folder it finished, so an interrupted run can carry on', async () => {
    folderFindMany.mockResolvedValue([{ id: 'f1', name: 'oak-table' }, { id: 'f2', name: 'walnut-table' }])
    const result = await refileRenditionsIntoThumbFolders({ after: 'f0', limit: 2 })
    expect(result.lastFolderId).toBe('f2')
    expect(result.more).toBe(false)
  })
})
