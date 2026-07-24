import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Media } from '@prisma/client'

// planMediaReplacement decides where a "Replace" upload's bytes land, and it is
// the exact spot both previous bulk-upload fixes aimed at - without a test, so
// nothing proved what it does against the rows a real library actually holds.
//
// The rows these tests model are lifted from a live site: the optimiser
// re-encodes a .jpg upload to WebP and moves its exact-name key to .webp, but
// the item keeps its "photo.jpg" display name. Re-uploading the originals into
// that folder then prompts, and "Replace" hands planMediaReplacement a
// webp-typed row plus jpeg bytes - the case that used to 409 every file in the
// batch as a "type change".

const findUniqueMedia = vi.fn()
const findUniqueFolder = vi.fn()

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    media: { findUnique: (...args: unknown[]) => findUniqueMedia(...args) },
    folder: { findUnique: (...args: unknown[]) => findUniqueFolder(...args) },
  },
}))

import { planMediaReplacement, MediaReplaceTypeError } from '@/lib/media/upload'

function mediaRow(overrides: Partial<Media>): Media {
  return {
    id: 'm1',
    key: 'media/dynamic/photo.webp',
    url: 'https://worker.example/media/dynamic/photo.webp',
    provider: 'B2',
    mimeType: 'image/webp',
    sizeBytes: 1000,
    uploadedById: null,
    altText: null,
    isDecorative: false,
    originalName: 'photo.jpg',
    folderId: 'f1',
    optimised: true,
    createdAt: new Date('2026-07-21'),
    ...overrides,
  } as unknown as Media
}

beforeEach(() => {
  findUniqueMedia.mockReset()
  findUniqueFolder.mockReset()
  // One folder, named to sanitise into the key's directory.
  findUniqueFolder.mockResolvedValue({ name: 'dynamic', parentId: null })
  // Default: no other row holds any candidate key.
  findUniqueMedia.mockResolvedValue(null)
})

describe('planMediaReplacement', () => {
  it('allows jpeg bytes over an optimised exact-named webp item (the bulk re-upload case)', async () => {
    const media = mediaRow({})
    const plan = await planMediaReplacement(media, 'image/jpeg')
    // ".jpeg", not ".jpg": key extensions come from the MIME type
    // (extensionForMimeType), not from the uploaded filename.
    expect(plan.key).toBe('media/dynamic/photo.jpeg')
    expect(plan.exactName).toBe(true)
    expect(plan.originalName).toBe('photo.jpeg')
  })

  it('same type over same type never moves the key', async () => {
    const media = mediaRow({ originalName: 'photo.webp' })
    const plan = await planMediaReplacement(media, 'image/webp')
    expect(plan.key).toBe(media.key)
    expect(findUniqueMedia).not.toHaveBeenCalled()
  })

  it('falls to the nanoid form when the swapped-to exact key belongs to another row', async () => {
    findUniqueMedia.mockResolvedValue({ id: 'other-row' })
    const media = mediaRow({})
    const plan = await planMediaReplacement(media, 'image/jpeg')
    expect(plan.key).not.toBe('media/dynamic/photo.jpeg')
    expect(plan.key).toMatch(/^media\/dynamic\/.+\.jpeg$/)
    expect(plan.exactName).toBe(false)
  })

  it('still refuses a non-raster type change on an exact-named item', async () => {
    const media = mediaRow({
      key: 'media/dynamic/part.glb',
      originalName: 'part.glb',
      mimeType: 'model/gltf-binary',
    })
    await expect(planMediaReplacement(media, 'image/jpeg')).rejects.toThrow(MediaReplaceTypeError)
  })

  it('lets a nanoid-keyed item change type freely - its key was never a name', async () => {
    const media = mediaRow({
      key: 'media/dynamic/Vx1yZq2w3e-photo.webp',
      originalName: 'photo.jpg',
    })
    const plan = await planMediaReplacement(media, 'image/jpeg')
    expect(plan.key).toMatch(/\.jpeg$/)
    // No exact key to defend, so no availability lookup was needed.
    expect(plan.exactName).toBe(false)
  })
})
