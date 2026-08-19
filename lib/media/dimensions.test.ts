import { afterEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import {
  dimensionFields,
  dimensionsFromBuffer,
  isMeasurableImageType,
  probeDimensionsByUrl,
} from '@/lib/media/dimensions'

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#336699' } }).png().toBuffer()

describe('isMeasurableImageType', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])('measures %s', (type) => {
    expect(isMeasurableImageType(type)).toBe(true)
  })

  // The three kinds that never carry a pixel size, each for its own reason: an
  // SVG's size is a hint rather than a fact, and nothing on the server decodes a
  // video or a 3D file.
  it.each(['image/svg+xml', 'video/mp4', 'model/gltf-binary', 'application/pdf'])(
    'leaves %s unmeasured',
    (type) => {
      expect(isMeasurableImageType(type)).toBe(false)
    },
  )
})

describe('dimensionsFromBuffer', () => {
  it('reads the pixel size of an image', async () => {
    expect(await dimensionsFromBuffer(await png(40, 25))).toEqual({ width: 40, height: 25 })
  })

  it('applies EXIF orientation, so a portrait photograph is not recorded as landscape', async () => {
    // Orientation 6 is "rotate 90" - what a phone writes beside a frame it
    // stored the wide way round. Every browser draws it 25x40; recording the
    // stored 40x25 would sort it with the landscapes and contradict the very
    // thumbnail sitting next to it in the grid.
    const rotated = await sharp({ create: { width: 40, height: 25, channels: 3, background: '#336699' } })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer()
    expect(await dimensionsFromBuffer(rotated)).toEqual({ width: 25, height: 40 })
  })

  it('returns null for bytes that are not an image', async () => {
    expect(await dimensionsFromBuffer(Buffer.from('not a picture'))).toBeNull()
  })
})

describe('dimensionFields', () => {
  it('derives pixels from the pair, so the three columns cannot disagree', () => {
    expect(dimensionFields({ width: 1920, height: 1080 })).toEqual({
      width: 1920,
      height: 1080,
      pixels: 2073600,
    })
  })

  it('clears all three when there is nothing to record', () => {
    expect(dimensionFields(null)).toEqual({ width: null, height: null, pixels: null })
    expect(dimensionFields(undefined)).toEqual({ width: null, height: null, pixels: null })
  })
})

describe('probeDimensionsByUrl', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('measures from a range request rather than the whole file', async () => {
    const bytes = await png(64, 48)
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      seenInit = init
      return new Response(new Uint8Array(bytes), { status: 206 })
    })
    let seenInit: RequestInit | undefined
    vi.stubGlobal('fetch', fetchMock)

    expect(await probeDimensionsByUrl('https://media.example/x.png')).toEqual({ width: 64, height: 48 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((seenInit?.headers as Record<string, string>).Range).toMatch(/^bytes=0-/)
  })

  it('does not ask twice for a short body it could not read', async () => {
    // The whole object came back in the first request and still would not parse,
    // so there is nothing more to fetch - refetching would just be a second
    // download of the same unreadable file.
    const fetchMock = vi.fn(async () => new Response(new Uint8Array(Buffer.from('nonsense')), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    expect(await probeDimensionsByUrl('https://media.example/x.png')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('gives up quietly when the object cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network') }))
    expect(await probeDimensionsByUrl('https://media.example/gone.png')).toBeNull()
  })
})
