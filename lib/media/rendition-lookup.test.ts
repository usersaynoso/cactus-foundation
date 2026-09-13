import { describe, it, expect, vi, beforeEach } from 'vitest'

// Three media questions and one folder question, told apart by the shape of what
// is asked: the originals (by url), the folder's other originals (by mime type),
// and the copies (by name).
type MediaRow = { url: string; key: string; folderId: string | null; mimeType: string; originalName?: string; createdAt: number }
let library: MediaRow[] = []

const mediaFindMany = vi.fn(async (args: { where: Record<string, unknown> }) => {
  const where = args.where
  const urlIn = (where.url as { in?: string[] } | undefined)?.in
  if (urlIn) return library.filter((m) => urlIn.includes(m.url))
  const urlNotIn = (where.url as { notIn?: string[] } | undefined)?.notIn
  if (urlNotIn) {
    return library.filter((m) => !urlNotIn.includes(m.url) && !m.originalName?.endsWith('-thumb.webp') && m.mimeType !== 'image/svg+xml')
  }
  const names = (where.originalName as { in: string[] }).in
  return library
    .filter((m) => m.originalName && names.includes(m.originalName))
    .sort((a, b) => a.createdAt - b.createdAt)
})

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    media: { findMany: (args: { where: Record<string, unknown> }) => mediaFindMany(args) },
    folder: { findMany: async () => [{ id: 'f1-thumb', parentId: 'f1' }] },
  },
}))

const { findRenditionUrls } = await import('@/lib/media/rendition-lookup')

const original = (name: string, mimeType = 'image/webp'): MediaRow => ({
  url: `https://cdn.example/shop/harlestone/${name}`,
  key: `media/shop/harlestone/${name}`,
  folderId: 'f1',
  mimeType,
  createdAt: 1,
})
const copy = (name: string): MediaRow => ({
  url: `https://cdn.example/shop/harlestone/thumb/ab1-${name}`,
  key: `media/shop/harlestone/thumb/ab1-${name}`,
  folderId: 'f1-thumb',
  mimeType: 'image/webp',
  originalName: name,
  createdAt: 2,
})

beforeEach(() => {
  library = []
  mediaFindMany.mockClear()
})

describe('findRenditionUrls', () => {
  it("finds a picture's own copy in its thumb folder", async () => {
    const oak = original('oak.webp')
    library = [oak, copy('oak-thumb.webp')]

    const found = await findRenditionUrls([oak.url], 'thumb')

    expect(found.get(oak.url)).toBe('https://cdn.example/shop/harlestone/thumb/ab1-oak-thumb.webp')
  })

  // Deskwell, 2026-09-13: `harlestone.webp` and a later `harlestone.jpeg` in one
  // folder both answer to `harlestone-thumb.webp`. Whichever picture that file
  // shows, one of the two gallery rows would draw the other's photograph.
  it('gives a shared copy name to neither original when both are asked about', async () => {
    const webp = original('harlestone.webp')
    const jpeg = original('harlestone.jpeg', 'image/jpeg')
    library = [webp, jpeg, copy('harlestone-thumb.webp')]

    const found = await findRenditionUrls([webp.url, jpeg.url], 'thumb')

    expect(found.has(webp.url)).toBe(false)
    expect(found.has(jpeg.url)).toBe(false)
  })

  it('declines a shared copy name when the other original is not in the batch', async () => {
    const webp = original('harlestone.webp')
    const jpeg = original('harlestone.jpeg', 'image/jpeg')
    library = [webp, jpeg, copy('harlestone-thumb.webp')]

    const found = await findRenditionUrls([jpeg.url], 'thumb')

    expect(found.has(jpeg.url)).toBe(false)
  })

  it('still resolves the rest of the batch around a shared name', async () => {
    const webp = original('harlestone.webp')
    const jpeg = original('harlestone.jpeg', 'image/jpeg')
    const other = original('harlestone1.webp')
    library = [webp, jpeg, other, copy('harlestone-thumb.webp'), copy('harlestone1-thumb.webp')]

    const found = await findRenditionUrls([webp.url, other.url], 'thumb')

    expect(found.has(webp.url)).toBe(false)
    expect(found.get(other.url)).toBe('https://cdn.example/shop/harlestone/thumb/ab1-harlestone1-thumb.webp')
  })
})
