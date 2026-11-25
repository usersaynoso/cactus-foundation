import { beforeEach, describe, expect, it, vi } from 'vitest'

// Deleting a file that is already gone is a success - it is on S3, and both the
// library's delete and the superseded-blob sweep rely on it. Vercel Blob and
// ImageKit throw a not-found instead, which left an item whose file had vanished
// impossible to delete from the library.

class BlobNotFoundError extends Error {}
const head = vi.fn()
const del = vi.fn()
vi.mock('@vercel/blob', () => ({ head: (...a: unknown[]) => head(...a), del: (...a: unknown[]) => del(...a), BlobNotFoundError }))

class NotFoundError extends Error {}
const ikDelete = vi.fn()
vi.mock('@imagekit/nodejs', () => ({
  default: class {
    files = { delete: (...a: unknown[]) => ikDelete(...a) }
  },
  NotFoundError,
}))

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }))

import { deleteMedia } from '@/lib/media/upload'

beforeEach(() => {
  head.mockReset()
  del.mockReset()
  ikDelete.mockReset()
})

describe('deleteMedia on a file that is already gone', () => {
  it('Vercel Blob: not found is a quiet success', async () => {
    head.mockRejectedValue(new BlobNotFoundError('gone'))
    await expect(deleteMedia('VERCEL_BLOB', 'media/VERCEL_BLOB/a.png')).resolves.toBeUndefined()
    expect(del).not.toHaveBeenCalled()
  })

  it('Vercel Blob: any other failure still throws', async () => {
    head.mockRejectedValue(new Error('refused'))
    await expect(deleteMedia('VERCEL_BLOB', 'media/VERCEL_BLOB/a.png')).rejects.toThrow('refused')
  })

  it('Vercel Blob: a present blob is deleted by its url', async () => {
    head.mockResolvedValue({ url: 'https://blob.example/a.png' })
    await deleteMedia('VERCEL_BLOB', 'media/VERCEL_BLOB/a.png')
    expect(del).toHaveBeenCalledWith('https://blob.example/a.png', expect.anything())
  })

  it('ImageKit: not found is a quiet success, anything else throws', async () => {
    ikDelete.mockRejectedValueOnce(new NotFoundError('gone'))
    await expect(deleteMedia('IMAGEKIT', 'file-id')).resolves.toBeUndefined()
    ikDelete.mockRejectedValueOnce(new Error('refused'))
    await expect(deleteMedia('IMAGEKIT', 'file-id')).rejects.toThrow('refused')
  })
})
