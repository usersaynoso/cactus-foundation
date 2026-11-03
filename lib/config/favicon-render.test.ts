import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import sharp from 'sharp'
import { composeIco, ensurePng, isPng, looksLikeSvg, renderPng } from './favicon-render'
import { pngDimensions } from './favicon-ico'

const cactusSvg = readFileSync(join(process.cwd(), 'public/cactus-favicon.svg'))
const cactus96 = readFileSync(join(process.cwd(), 'public/cactus-favicon-96x96.png'))

describe('renderPng', () => {
  it('turns a WebP into a PNG of exactly the size asked for', async () => {
    // What the media optimiser left Deskwell's icons as.
    const webp = await sharp(cactus96).webp().toBuffer()
    for (const size of [16, 32, 48, 96, 180, 192, 512]) {
      const out = await renderPng(webp, size)
      expect(isPng(out)).toBe(true)
      expect(pngDimensions(out)).toEqual({ width: size, height: size })
    }
  })

  it('rasterises an SVG at every size', async () => {
    expect(looksLikeSvg(cactusSvg)).toBe(true)
    for (const size of [16, 512]) {
      const out = await renderPng(cactusSvg, size)
      expect(pngDimensions(out)).toEqual({ width: size, height: size })
    }
  })

  it('pads a non-square image rather than cropping it', async () => {
    const wide = await sharp({ create: { width: 200, height: 100, channels: 4, background: '#ff0000' } }).png().toBuffer()
    const out = await renderPng(wide, 32)
    expect(pngDimensions(out)).toEqual({ width: 32, height: 32 })
  })

  it('flattens onto a background when asked (the Apple touch icon)', async () => {
    const out = await renderPng(cactus96, 180, '#ffffff')
    const meta = await sharp(out).metadata()
    expect(meta.hasAlpha).toBe(false)
  })
})

describe('ensurePng', () => {
  it('hands back an exact-size PNG untouched', async () => {
    const out = await ensurePng(cactus96, 96)
    expect(out.equals(cactus96)).toBe(true)
  })

  it('redraws a PNG of the wrong size', async () => {
    const out = await ensurePng(cactus96, 32)
    expect(pngDimensions(out)).toEqual({ width: 32, height: 32 })
  })
})

describe('composeIco', () => {
  it('builds a real ICO from drawn sizes', async () => {
    const pngs = await Promise.all([16, 32, 48].map((s) => renderPng(cactusSvg, s)))
    const ico = composeIco(pngs)
    expect(ico).not.toBeNull()
    expect([...ico!.subarray(0, 4)]).toEqual([0, 0, 1, 0])
    expect(ico!.readUInt16LE(4)).toBe(3)
  })
})
