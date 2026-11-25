import { beforeEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import type { Media } from '@prisma/client'
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'

// A phone photograph stores its pixel rows sideways with an EXIF "rotate 90"
// beside them, and sharp writes no metadata on output unless told to. Every
// re-encode that does not apply the orientation itself therefore hands back a
// picture lying on its side. These pin the in-place optimise and resize to
// the picture as it is drawn, not as it is stored.

const stored = new Map<string, Buffer>()
const send = vi.fn(async (cmd: unknown) => {
  if (cmd instanceof GetObjectCommand) {
    const bytes = stored.get(cmd.input.Key as string)
    return { Body: { transformToByteArray: async () => (bytes ? new Uint8Array(bytes) : undefined) } }
  }
  if (cmd instanceof PutObjectCommand) {
    stored.set(cmd.input.Key as string, cmd.input.Body as Buffer)
    return {}
  }
  return {}
})

const findUniqueMedia = vi.fn()
const updateMedia = vi.fn()

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    media: {
      findUnique: (...args: unknown[]) => findUniqueMedia(...args),
      update: (...args: unknown[]) => updateMedia(...args),
    },
    folder: { findUnique: async () => null },
    $executeRaw: async () => 0,
  },
}))
vi.mock('@/lib/media/s3-config', () => ({
  isS3Provider: (p: string) => ['B2', 'R2', 'S3', 'SPACES', 'WASABI', 'MINIO'].includes(p),
  getS3Config: () => ({ client: { send }, bucket: 'bucket' }),
}))
vi.mock('@/lib/media/former-addresses', () => ({ recordFormerMediaAddress: async () => {} }))
vi.mock('@/lib/media/retired-blobs', () => ({ retireMediaBlob: async () => {} }))
vi.mock('@/lib/media/reference-rewriters', () => ({ getMediaReferenceRewriters: () => [] }))
vi.mock('@/lib/media/renditions', () => ({ refreshRenditions: async () => {} }))
vi.mock('@/lib/config/site-icons', () => ({ siteIconMediaIds: async () => new Set<string>() }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { optimiseMediaInPlace, resizeMediaImage } from '@/lib/media/upload'

const KEY = 'media/R2/photo.jpeg'

function row(): Media {
  return {
    id: 'm1',
    key: KEY,
    url: `https://worker.example/${KEY}`,
    provider: 'R2',
    mimeType: 'image/jpeg',
    sizeBytes: 1,
    uploadedById: null,
    altText: null,
    isDecorative: false,
    originalName: 'photo.jpeg',
    folderId: null,
    optimised: false,
    createdAt: new Date('2026-11-24'),
  } as unknown as Media
}

// Stored 800x400 with orientation 6, so drawn 400 wide and 800 tall. Noisy
// rather than flat so the WebP re-encode cannot undercut it by accident.
async function sidewaysPhoto(): Promise<Buffer> {
  const raw = Buffer.alloc(800 * 400 * 3)
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 7919) % 251
  return sharp(raw, { raw: { width: 800, height: 400, channels: 3 } })
    .jpeg({ quality: 95 })
    .withMetadata({ orientation: 6 })
    .toBuffer()
}

async function drawnSize(bytes: Buffer): Promise<[number, number]> {
  const meta = await sharp(bytes).metadata()
  const sideways = (meta.orientation ?? 1) >= 5
  return sideways ? [meta.height ?? 0, meta.width ?? 0] : [meta.width ?? 0, meta.height ?? 0]
}

beforeEach(async () => {
  process.env.CLOUDFLARE_WORKER_URL = 'https://worker.example'
  stored.clear()
  stored.set(KEY, await sidewaysPhoto())
  send.mockClear()
  findUniqueMedia.mockReset()
  updateMedia.mockReset()
  // The item itself by id; no other row holds any key asked about.
  findUniqueMedia.mockImplementation(async (args: { where: { id?: string } }) => (args.where.id === 'm1' ? row() : null))
  updateMedia.mockImplementation(async (args: { data: Partial<Media> }) => ({ ...row(), ...args.data }))
})

describe('EXIF orientation survives an in-place rewrite', () => {
  it('optimise keeps a portrait photograph portrait', async () => {
    const result = await optimiseMediaInPlace('m1')
    expect(result.optimised).toBe(true)
    const webp = stored.get('media/R2/photo.webp')
    expect(webp).toBeDefined()
    expect(await drawnSize(webp as Buffer)).toEqual([400, 800])
  })

  it('resize fits the box to the picture as drawn and keeps it upright', async () => {
    const result = await resizeMediaImage('m1', { box: { width: 200, height: 200 }, mode: 'replace' })
    expect(result.changed).toBe(true)
    if (!result.changed) return
    // A 400x800 picture inside a 200x200 box is 100x200, portrait.
    expect([result.width, result.height]).toEqual([100, 200])
    expect(await drawnSize(stored.get(KEY) as Buffer)).toEqual([100, 200])
  })
})
