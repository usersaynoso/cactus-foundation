import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { buildIco, pngDimensions } from './favicon-ico'

// The bundled Cactus renditions double as fixtures - real sharp-produced PNGs,
// exactly what the branding route composes from in production.
const png16 = new Uint8Array(readFileSync(join(process.cwd(), 'public/cactus-favicon-16x16.png')))
const png32 = new Uint8Array(readFileSync(join(process.cwd(), 'public/cactus-favicon-32x32.png')))
const png96 = new Uint8Array(readFileSync(join(process.cwd(), 'public/favicon-96x96.png')))

describe('pngDimensions', () => {
  it('reads the IHDR of real PNGs', () => {
    expect(pngDimensions(png16)).toEqual({ width: 16, height: 16 })
    expect(pngDimensions(png32)).toEqual({ width: 32, height: 32 })
    expect(pngDimensions(png96)).toEqual({ width: 96, height: 96 })
  })

  it('rejects non-PNG bytes rather than misreading them', () => {
    expect(pngDimensions(new Uint8Array([1, 2, 3]))).toBeNull()
    // An ICO's own magic, to prove a hand-uploaded .ico never gets wrapped again.
    const ico = new Uint8Array(24)
    ico[2] = 1
    expect(pngDimensions(ico)).toBeNull()
  })
})

describe('buildIco', () => {
  it('wraps PNGs into a well-formed container, smallest first', () => {
    const ico = buildIco([png96, png16, png32])
    expect(ico).not.toBeNull()
    const view = new DataView(ico!.buffer)
    // ICONDIR header: reserved 0, type 1, three entries.
    expect(view.getUint16(0, true)).toBe(0)
    expect(view.getUint16(2, true)).toBe(1)
    expect(view.getUint16(4, true)).toBe(3)
    // Directory sorted ascending, offsets landing on intact PNG signatures.
    const sizes: number[] = []
    for (let i = 0; i < 3; i++) {
      const dir = 6 + 16 * i
      sizes.push(ico![dir]!)
      const length = view.getUint32(dir + 8, true)
      const offset = view.getUint32(dir + 12, true)
      const payload = ico!.slice(offset, offset + length)
      expect(pngDimensions(payload)).not.toBeNull()
    }
    expect(sizes).toEqual([16, 32, 96])
    // Total length is exactly header + directory + payloads.
    expect(ico!.length).toBe(6 + 48 + png16.length + png32.length + png96.length)
  })

  it('skips what it cannot use and still builds from the rest', () => {
    const ico = buildIco([new Uint8Array([9, 9, 9]), png16])
    expect(ico).not.toBeNull()
    expect(new DataView(ico!.buffer).getUint16(4, true)).toBe(1)
  })

  it('returns null when nothing usable is supplied, so the caller can fall back', () => {
    expect(buildIco([])).toBeNull()
    expect(buildIco([new Uint8Array([1, 2, 3])])).toBeNull()
  })
})
