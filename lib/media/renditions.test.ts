import { describe, it, expect, vi, beforeEach } from 'vitest'
import sharp from 'sharp'

const findFirst = vi.fn()
const findMany = vi.fn()
const deleteRow = vi.fn()
const downloadMedia = vi.fn()
const uploadMedia = vi.fn()
const saveMediaRecord = vi.fn()
const deleteMedia = vi.fn()
const rewriteMediaReferencesInContent = vi.fn()

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    media: {
      findFirst: (...a: unknown[]) => findFirst(...a),
      findMany: (...a: unknown[]) => findMany(...a),
      delete: (...a: unknown[]) => deleteRow(...a),
    },
  },
}))
vi.mock('@/lib/media/upload', () => ({
  downloadMedia: (...a: unknown[]) => downloadMedia(...a),
  uploadMedia: (...a: unknown[]) => uploadMedia(...a),
  saveMediaRecord: (...a: unknown[]) => saveMediaRecord(...a),
  deleteMedia: (...a: unknown[]) => deleteMedia(...a),
  rewriteMediaReferencesInContent: (...a: unknown[]) => rewriteMediaReferencesInContent(...a),
}))
// The `thumb` folder each copy is filed in. `findChildFolder` answers "is it
// there yet?" and is the switch these tests flip: null means the folder has never
// been made, which is every install before the tidy-up has run.
const findChildFolder = vi.fn()
const getOrCreateChildFolder = vi.fn()
const findChildFolders = vi.fn()
const moveOrRenameMedia = vi.fn()
vi.mock('@/lib/media/organise', () => ({
  resolveFolderPath: async () => 'shop/attributes',
  findChildFolder: (...a: unknown[]) => findChildFolder(...a),
  findChildFolders: (...a: unknown[]) => findChildFolders(...a),
  getOrCreateChildFolder: (...a: unknown[]) => getOrCreateChildFolder(...a),
  moveOrRenameMedia: (...a: unknown[]) => moveOrRenameMedia(...a),
}))

const { generateImageRenditions, refreshRenditions, carryRenditionsWithOriginal } =
  await import('@/lib/media/renditions')

const SOURCE = 'https://cdn.example/shop/attributes/oak.png'
const SOURCE_ROW = {
  id: 'm1', key: 'shop/attributes/oak.png', url: SOURCE, provider: 'B2',
  mimeType: 'image/png', sizeBytes: 900_000, folderId: 'f1', uploadedById: 'u1',
}

// A picture well over both caps, so every rendition is worth making.
const big = async () =>
  sharp({ create: { width: 1000, height: 1000, channels: 3, background: '#8a5a2b' } }).png().toBuffer()

// findFirst is asked two different questions: "what is the source?" (by url) and
// "does this rendition already exist?" (by folder + name). `renditions` is what
// the second question finds.
function wireLibrary(renditions: Record<string, string> = {}) {
  findFirst.mockImplementation(async (args: { where: Record<string, unknown> }) => {
    if (args.where.url === SOURCE) return SOURCE_ROW
    const name = args.where.originalName as string
    return renditions[name] ? { url: renditions[name] } : null
  })
}

// A nanoid-style prefix on every upload, the way the real key builder works - so a
// remade copy can never land on the address the stale one had. The counter makes
// each one distinct within a test.
let uploadCount = 0

beforeEach(async () => {
  vi.clearAllMocks()
  uploadCount = 0
  // The folder exists by default, which is the state every install ends up in.
  findChildFolder.mockResolvedValue('f1-thumb')
  getOrCreateChildFolder.mockResolvedValue('f1-thumb')
  findChildFolders.mockResolvedValue(new Map())
  moveOrRenameMedia.mockResolvedValue({})
  downloadMedia.mockResolvedValue(await big())
  findMany.mockResolvedValue([])
  deleteRow.mockResolvedValue({})
  uploadMedia.mockImplementation(async (_b: Buffer, _m: string, _p: string, name: string) => {
    const key = `shop/attributes/id${++uploadCount}-${name}`
    return { key, url: `https://cdn.example/${key}` }
  })
  saveMediaRecord.mockImplementation(async (rec: { url: string }) => ({ url: rec.url }))
})

describe('generateImageRenditions', () => {
  it('makes each requested size once, named after the original', async () => {
    wireLibrary()
    const made = await generateImageRenditions(SOURCE, [
      { maxPx: 400, suffix: 'small' },
      { maxPx: 128, suffix: 'tiny' },
    ], { worthwhileBytes: 100_000 })

    // A nanoid key, like any other library upload - the copy is found again by
    // its `originalName`, never by a reconstructable key. That is what lets a
    // remade copy take a fresh address rather than overwrite a file every cache
    // has been told to keep for a year.
    expect(made.small).toBe('https://cdn.example/shop/attributes/id1-oak-small.webp')
    expect(made.tiny).toBe('https://cdn.example/shop/attributes/id2-oak-tiny.webp')
    // One download and decode for both encodes - the whole reason specs come as
    // a list rather than one call each.
    expect(downloadMedia).toHaveBeenCalledTimes(1)
    expect(uploadMedia).toHaveBeenCalledTimes(2)
    // Filed one level down, in the original's `thumb` folder - both in storage
    // (the path handed to the uploader) and in the library (the folder the row is
    // saved against). A product's folder has to read as the product's pictures.
    expect(uploadMedia).toHaveBeenCalledWith(
      expect.anything(), 'image/webp', 'B2', 'oak-small.webp', 'shop/attributes/thumb',
    )
    expect(saveMediaRecord).toHaveBeenCalledWith(expect.objectContaining({ folderId: 'f1-thumb' }))
  })

  it('makes the thumb folder only when something is actually written', async () => {
    wireLibrary()
    findChildFolder.mockResolvedValue(null)
    downloadMedia.mockResolvedValue(
      await sharp({ create: { width: 100, height: 100, channels: 3, background: '#8a5a2b' } }).png().toBuffer(),
    )
    await generateImageRenditions(SOURCE, [{ maxPx: 128, suffix: 'tiny' }], { worthwhileBytes: 100_000 })
    // The picture declined to be shrunk, so a folder of pictures that all decline
    // must not gain an empty folder for its trouble.
    expect(getOrCreateChildFolder).not.toHaveBeenCalled()
  })

  it('reuses a copy still sitting beside its original on an install that has not been tidied', async () => {
    // Half-done is the normal state while the refile sweep runs. Minting a
    // duplicate of every picture in the catalogue because the tidy-up had not
    // reached it yet would be a poor trade.
    findChildFolder.mockResolvedValue(null)
    wireLibrary({ 'oak-tiny.webp': 'https://cdn.example/shop/attributes/oak-tiny.webp' })
    const made = await generateImageRenditions(SOURCE, [{ maxPx: 128, suffix: 'tiny' }], { worthwhileBytes: 100_000 })

    expect(made.tiny).toBe('https://cdn.example/shop/attributes/oak-tiny.webp')
    expect(uploadMedia).not.toHaveBeenCalled()
  })

  it('reuses a rendition that already exists instead of minting a duplicate', async () => {
    // The case that cost a live catalogue 258 orphan files: several values share
    // one fabric, so the copy is already there by the time the next one asks.
    wireLibrary({ 'oak-tiny.webp': 'https://cdn.example/shop/attributes/oak-tiny.webp' })
    const made = await generateImageRenditions(SOURCE, [{ maxPx: 128, suffix: 'tiny' }], { worthwhileBytes: 100_000 })

    expect(made.tiny).toBe('https://cdn.example/shop/attributes/oak-tiny.webp')
    expect(uploadMedia).not.toHaveBeenCalled()
    expect(saveMediaRecord).not.toHaveBeenCalled()
  })

  it('still makes the sizes that are missing when another already exists', async () => {
    wireLibrary({ 'oak-small.webp': 'https://cdn.example/shop/attributes/oak-small.webp' })
    const made = await generateImageRenditions(SOURCE, [
      { maxPx: 400, suffix: 'small' },
      { maxPx: 128, suffix: 'tiny' },
    ], { worthwhileBytes: 100_000 })

    expect(made.small).toBe('https://cdn.example/shop/attributes/oak-small.webp')
    expect(made.tiny).toBe('https://cdn.example/shop/attributes/id1-oak-tiny.webp')
    expect(uploadMedia).toHaveBeenCalledTimes(1)
  })

  it('declines a picture already inside the cap and under the weight', async () => {
    wireLibrary()
    downloadMedia.mockResolvedValue(
      await sharp({ create: { width: 100, height: 100, channels: 3, background: '#8a5a2b' } }).png().toBuffer(),
    )
    const made = await generateImageRenditions(SOURCE, [{ maxPx: 128, suffix: 'tiny' }], { worthwhileBytes: 100_000 })
    expect(made.tiny).toBeNull()
    expect(uploadMedia).not.toHaveBeenCalled()
  })

  it('declines a url the library has never heard of, and one it cannot shrink', async () => {
    findFirst.mockResolvedValue(null)
    expect(await generateImageRenditions('https://elsewhere.example/oak.png', [{ maxPx: 128, suffix: 'tiny' }], { worthwhileBytes: 100_000 }))
      .toEqual({ tiny: null })

    findFirst.mockImplementation(async () => ({ ...SOURCE_ROW, mimeType: 'image/svg+xml' }))
    expect(await generateImageRenditions(SOURCE, [{ maxPx: 128, suffix: 'tiny' }], { worthwhileBytes: 100_000 }))
      .toEqual({ tiny: null })
  })

  it('comes back null rather than throwing when the download fails', async () => {
    wireLibrary()
    downloadMedia.mockRejectedValue(new Error('provider hiccup'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await generateImageRenditions(SOURCE, [{ maxPx: 128, suffix: 'tiny' }], { worthwhileBytes: 100_000 }))
      .toEqual({ tiny: null })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

// Why these exist: a stale small copy is a perfectly valid image file. Nothing in
// tsc, eslint or a build can tell that a card is showing the picture a product had
// before somebody cropped it, and nobody would notice for months. The only place
// that can be caught is here.
describe('refreshRenditions, after an in-place edit of the original', () => {
  const EDITED = {
    id: 'm1',
    key: 'shop/attributes/oak.webp',
    url: 'https://cdn.example/shop/attributes/oak.webp',
    provider: 'B2' as const,
    mimeType: 'image/webp',
    folderId: 'f1',
  }
  // What the copies were called before the edit. An optimise re-extensions the
  // original (.png becomes .webp), so the copies have to be found by the name the
  // OLD key gave them, not the new one.
  const OLD_KEY = 'shop/attributes/oak.png'
  const staleThumb = { id: 'r1', key: 'shop/attributes/oak-thumb.webp', url: 'https://cdn.example/shop/attributes/oak-thumb.webp' }

  function wireStale(rows: Record<string, Array<{ id: string; key: string; url: string }>>) {
    findFirst.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      if (args.where.url === EDITED.url) return { ...EDITED, sizeBytes: 900_000, uploadedById: 'u1' }
      return null
    })
    findMany.mockImplementation(async (args: { where: { originalName: string } }) =>
      rows[args.where.originalName] ?? [])
  }

  it('remakes the copy at a NEW address, repoints what held it, then deletes the old one', async () => {
    wireStale({ 'oak-thumb.webp': [staleThumb] })
    await refreshRenditions(EDITED, OLD_KEY)

    const fresh = 'https://cdn.example/shop/attributes/id1-oak-thumb.webp'
    // A new address, not the old one. Remaking it in place would hand every
    // browser and edge cache bytes they have already been told to keep for a
    // year, so the new picture would simply never be fetched.
    expect(uploadMedia).toHaveBeenCalled()
    expect(saveMediaRecord).toHaveBeenCalledWith(expect.objectContaining({ url: fresh }))
    // Repointed through the same hook any other blob move uses, so a url held in
    // a module's own table follows.
    expect(rewriteMediaReferencesInContent).toHaveBeenCalledWith(staleThumb.url, fresh, staleThumb.key, fresh)
    // And only THEN is the stale one thrown away.
    expect(deleteRow).toHaveBeenCalledWith({ where: { id: 'r1' } })
    expect(deleteMedia).toHaveBeenCalledWith('B2', staleThumb.key)

    // `noUncheckedIndexedAccess` is on, so these are read rather than indexed
    // blind - and a missing entry here would mean the call never happened, which
    // the assertions above have already ruled out.
    const [rewriteAt] = rewriteMediaReferencesInContent.mock.invocationCallOrder
    const [deleteAt] = deleteMedia.mock.invocationCallOrder
    expect(rewriteAt).toBeDefined()
    expect(deleteAt).toBeDefined()
    expect(rewriteAt as number).toBeLessThan(deleteAt as number)
  })

  it('does nothing at all for an item that had no copies', async () => {
    wireStale({})
    await refreshRenditions(EDITED, OLD_KEY)
    expect(uploadMedia).not.toHaveBeenCalled()
    expect(deleteMedia).not.toHaveBeenCalled()
    expect(rewriteMediaReferencesInContent).not.toHaveBeenCalled()
  })

  it('points references back at the original when the item is no longer shrinkable', async () => {
    // A photograph replaced with an SVG. There is no copy to remake, and leaving
    // the old one would show the previous picture on every card - so what held it
    // is sent back to the original, which every renderer already falls back to.
    wireStale({ 'oak-thumb.webp': [staleThumb] })
    await refreshRenditions({ ...EDITED, mimeType: 'image/svg+xml' }, OLD_KEY)

    expect(uploadMedia).not.toHaveBeenCalled()
    expect(rewriteMediaReferencesInContent).toHaveBeenCalledWith(staleThumb.url, EDITED.url, staleThumb.key, EDITED.key)
    expect(deleteMedia).toHaveBeenCalledWith('B2', staleThumb.key)
  })

  it('never lets a failed copy take the edit down with it', async () => {
    wireStale({ 'oak-thumb.webp': [staleThumb] })
    downloadMedia.mockRejectedValueOnce(new Error('storage had a moment'))
    await expect(refreshRenditions(EDITED, OLD_KEY)).resolves.toBeUndefined()
    // The stale copy is left where it is rather than deleted: drawing the wrong
    // picture is bad, drawing a broken one is worse.
    expect(deleteMedia).not.toHaveBeenCalled()
  })

  // Both of the following took a live product's thumbnail off the site (Deskwell,
  // 2026-09-12): a photograph was uploaded as `iris.jpeg` beside an existing
  // `iris.webp`, the optimiser re-keyed it, and the refresh deleted a small copy
  // that two gallery rows were pointing at. Neither tsc, eslint nor a build can
  // see it - the only symptom is a picture that 404s some minutes later.
  it('never deletes the copy the remake just ADOPTED', async () => {
    // The remake resolves to a copy that already exists: generateImageRenditions
    // reuses one filed under the name it was about to write. Here that is the
    // stale row itself, so there is nothing to replace - and deleting it would
    // leave every reference aimed at a file that is no longer there.
    findFirst.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      if (args.where.url === EDITED.url) return { ...EDITED, sizeBytes: 900_000, uploadedById: 'u1' }
      return args.where.originalName === 'oak-thumb.webp' ? { url: staleThumb.url } : null
    })
    findMany.mockImplementation(async (args: { where: { originalName?: string } }) =>
      args.where.originalName === 'oak-thumb.webp' ? [staleThumb] : [])

    await refreshRenditions(EDITED, OLD_KEY)

    // Nothing minted, nothing repointed - and above all nothing deleted.
    expect(saveMediaRecord).not.toHaveBeenCalled()
    expect(deleteRow).not.toHaveBeenCalled()
    expect(deleteMedia).not.toHaveBeenCalled()
  })

  it('leaves alone a copy that belongs to another picture in the same folder', async () => {
    // A copy is named after its original's key with the extension taken off, so
    // `iris.jpeg` and `iris.webp` sitting in one folder both answer to
    // `iris-thumb.webp`. Optimising the first re-keys it, and the copies the OLD
    // key was named after are then the OTHER picture's - not this item's to remake
    // and certainly not its to delete.
    const OPTIMISED = { ...EDITED, key: 'shop/attributes/id9-iris.webp', url: 'https://cdn.example/shop/attributes/id9-iris.webp' }
    const neighboursThumb = { id: 'r9', key: 'shop/attributes/thumb/ab1-iris-thumb.webp', url: 'https://cdn.example/shop/attributes/thumb/ab1-iris-thumb.webp' }

    findFirst.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      if (args.where.url === OPTIMISED.url) return { ...OPTIMISED, sizeBytes: 900_000, uploadedById: 'u1' }
      return null
    })
    findMany.mockImplementation(async (args: { where: { originalName?: string } }) => {
      // The sibling question: which other originals live in this folder?
      if (args.where.originalName === undefined) return [{ key: 'shop/attributes/iris.webp' }]
      return args.where.originalName === 'iris-thumb.webp' ? [neighboursThumb] : []
    })

    await refreshRenditions(OPTIMISED, 'shop/attributes/iris.jpeg')

    expect(deleteRow).not.toHaveBeenCalled()
    expect(deleteMedia).not.toHaveBeenCalled()
    expect(rewriteMediaReferencesInContent).not.toHaveBeenCalled()
  })
})

// A copy left behind by a move is stranded twice over - wrong folder, and a name
// derived from a key that no longer exists - so every lookup comes back empty and
// the next render mints a duplicate. Nothing renders wrongly, which is exactly
// why it would go unnoticed.
describe('carryRenditionsWithOriginal, when the original moves', () => {
  const MOVED = { id: 'm1', key: 'shop/tables/variations/oak.png', folderId: 'f2' }

  it('moves each copy into the destination thumb folder under its new name', async () => {
    findChildFolder.mockResolvedValue('f1-thumb')
    getOrCreateChildFolder.mockResolvedValue('f2-thumb')
    findMany.mockImplementation(async (args: { where: { originalName: string } }) =>
      args.where.originalName === 'oak-thumb.webp' ? [{ id: 'r1' }] : [])

    await carryRenditionsWithOriginal(MOVED, 'f1', 'shop/tables/oak.png')

    expect(moveOrRenameMedia).toHaveBeenCalledWith('r1', {
      targetFolderId: 'f2-thumb',
      // Renamed to what the NEW key gives it, because that is the name every
      // lookup will ask for from here on.
      newName: 'oak-thumb.webp',
      collision: 'suffix',
      // A copy has no copies of its own, and asking would be three queries per
      // file across a backfill moving tens of thousands.
      carryRenditions: false,
    })
  })

  it('does nothing when neither the folder nor the key changed', async () => {
    await carryRenditionsWithOriginal(MOVED, 'f2', MOVED.key)
    expect(findMany).not.toHaveBeenCalled()
    expect(moveOrRenameMedia).not.toHaveBeenCalled()
  })

  it('never makes a destination folder for an item that has no copies', async () => {
    findMany.mockResolvedValue([])
    await carryRenditionsWithOriginal(MOVED, 'f1', 'shop/tables/oak.png')
    expect(getOrCreateChildFolder).not.toHaveBeenCalled()
    expect(moveOrRenameMedia).not.toHaveBeenCalled()
  })
})
