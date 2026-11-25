import { beforeEach, describe, expect, it, vi } from 'vitest'

// Moving a file to another provider changes its url and key, and pages, layouts
// and module tables hold both as plain strings. The migration used to update the
// row and delete the original on the spot, leaving every one of those naming a
// file that no longer existed. It has to finish a move the way every other move
// is finished: references rewritten, original queued rather than deleted.

const calls: string[] = []
const item = {
  id: 'm1', provider: 'B2', key: 'media/photo.jpeg', url: 'https://w.example/media/photo.jpeg',
  mimeType: 'image/jpeg', originalName: 'photo.jpeg', folderId: 'f1',
}

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    mediaMigrationJob: {
      findFirst: async () => ({ id: 'j1', status: 'running', toProvider: 'R2', cursor: null, failedItemIds: [], migratedItems: 0, lastError: null }),
      update: async (args: { data: Record<string, unknown> }) => ({ migratedItems: args.data.migratedItems ?? 0, cursor: args.data.cursor ?? null }),
    },
    media: {
      findMany: async () => [item],
      update: async () => { calls.push('row'); return {} },
      count: async () => 0,
    },
  },
}))
const deleteMedia = vi.fn()
vi.mock('@/lib/media/upload', () => ({
  downloadMedia: async () => Buffer.from('bytes'),
  uploadMedia: async (_b: Buffer, mime: string, provider: string, name?: string, folder?: string) => {
    calls.push(`upload:${provider}:${name}:${folder}`)
    return { key: 'media/R2/photos/abc-photo.jpeg', url: 'https://w.example/media/R2/photos/abc-photo.jpeg', mimeType: mime, sizeBytes: 5 }
  },
  rewriteMediaReferencesInContent: async (oldUrl: string, newUrl: string, oldKey: string, newKey: string) => {
    calls.push(`rewrite:${oldUrl}>${newUrl}:${oldKey}>${newKey}`)
    return true
  },
  deleteMedia: (...a: unknown[]) => deleteMedia(...a),
}))
vi.mock('@/lib/media/former-addresses', () => ({
  recordFormerMediaAddress: async (_id: string, url: string) => { calls.push(`former:${url}`) },
}))
vi.mock('@/lib/media/retired-blobs', () => ({
  retireMediaBlob: async (provider: string, key: string) => { calls.push(`retire:${provider}:${key}`) },
}))
vi.mock('@/lib/media/organise', () => ({ resolveFolderPath: async () => 'photos' }))

import { processBatch } from '@/lib/media/migration'

beforeEach(() => {
  calls.length = 0
  deleteMedia.mockReset()
})

describe('provider migration', () => {
  it('rewrites every reference and queues the original instead of deleting it', async () => {
    const result = await processBatch()
    expect(result.migratedItems).toBe(1)
    expect(calls).toEqual([
      'upload:R2:photo.jpeg:photos',
      'row',
      `former:${item.url}`,
      `rewrite:${item.url}>https://w.example/media/R2/photos/abc-photo.jpeg:${item.key}>media/R2/photos/abc-photo.jpeg`,
      `retire:B2:${item.key}`,
    ])
    expect(deleteMedia).not.toHaveBeenCalled()
  })
})
