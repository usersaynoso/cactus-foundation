import { describe, it, expect, vi, beforeEach } from 'vitest'
import sharp from 'sharp'

const findFirst = vi.fn()
const downloadMedia = vi.fn()
const uploadMedia = vi.fn()
const saveMediaRecord = vi.fn()
const buildLibraryUploadKey = vi.fn()

vi.mock('@/lib/db/prisma', () => ({ prisma: { media: { findFirst: (...a: unknown[]) => findFirst(...a) } } }))
vi.mock('@/lib/media/upload', () => ({
  downloadMedia: (...a: unknown[]) => downloadMedia(...a),
  uploadMedia: (...a: unknown[]) => uploadMedia(...a),
  saveMediaRecord: (...a: unknown[]) => saveMediaRecord(...a),
  buildLibraryUploadKey: (...a: unknown[]) => buildLibraryUploadKey(...a),
}))
vi.mock('@/lib/media/organise', () => ({ resolveFolderPath: async () => 'shop/attributes' }))

const { generateImageRenditions } = await import('@/lib/media/renditions')

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

beforeEach(async () => {
  vi.clearAllMocks()
  downloadMedia.mockResolvedValue(await big())
  buildLibraryUploadKey.mockImplementation(async (_p: string, _m: string, name: string) => `shop/attributes/${name}`)
  uploadMedia.mockImplementation(async (_b: Buffer, _m: string, _p: string, name: string) => ({
    key: `shop/attributes/${name}`, url: `https://cdn.example/shop/attributes/${name}`,
  }))
  saveMediaRecord.mockImplementation(async (rec: { url: string }) => ({ url: rec.url }))
})

describe('generateImageRenditions', () => {
  it('makes each requested size once, named after the original', async () => {
    wireLibrary()
    const made = await generateImageRenditions(SOURCE, [
      { maxPx: 400, suffix: 'small' },
      { maxPx: 128, suffix: 'tiny' },
    ], { worthwhileBytes: 100_000 })

    expect(made.small).toBe('https://cdn.example/shop/attributes/oak-small.webp')
    expect(made.tiny).toBe('https://cdn.example/shop/attributes/oak-tiny.webp')
    // One download and decode for both encodes - the whole reason specs come as
    // a list rather than one call each.
    expect(downloadMedia).toHaveBeenCalledTimes(1)
    expect(uploadMedia).toHaveBeenCalledTimes(2)
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
    expect(made.tiny).toBe('https://cdn.example/shop/attributes/oak-tiny.webp')
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
