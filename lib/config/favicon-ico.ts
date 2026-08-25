// Builds a real .ico container from PNG renditions, so /favicon.ico can answer
// with actual ICO magic bytes rather than a bare PNG at a .ico address. The
// container format is trivial - a 6-byte header, a 16-byte directory entry per
// image, then the images back to back - and every current browser accepts PNG
// data inside the entries, which is what lets this be plain buffer work with no
// image library anywhere near the request path.

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

// Width/height straight out of the IHDR chunk, which the PNG spec fixes at
// bytes 16-23 of the file. Returns null for anything that is not a PNG.
export function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return null
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

// Wraps the given PNGs into one .ico, smallest first. Anything that is not a
// PNG, or is too big for the format (a directory entry's size byte tops out at
// 256), is skipped rather than corrupting the container; null when nothing
// usable remains, so the caller can fall back to serving a single image.
export function buildIco(pngs: Uint8Array[]): Uint8Array | null {
  const entries: { png: Uint8Array; width: number; height: number }[] = []
  for (const png of pngs) {
    const dims = pngDimensions(png)
    if (!dims) continue
    if (dims.width < 1 || dims.width > 256 || dims.height < 1 || dims.height > 256) continue
    entries.push({ png, ...dims })
  }
  if (entries.length === 0) return null
  entries.sort((a, b) => a.width - b.width)

  const headerSize = 6 + 16 * entries.length
  const total = headerSize + entries.reduce((n, e) => n + e.png.length, 0)
  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)

  view.setUint16(0, 0, true) // reserved
  view.setUint16(2, 1, true) // type: icon
  view.setUint16(4, entries.length, true)

  let dirOffset = 6
  let dataOffset = headerSize
  for (const e of entries) {
    out[dirOffset] = e.width === 256 ? 0 : e.width // 0 means 256, per the format
    out[dirOffset + 1] = e.height === 256 ? 0 : e.height
    out[dirOffset + 2] = 0 // no palette
    out[dirOffset + 3] = 0 // reserved
    view.setUint16(dirOffset + 4, 1, true) // colour planes
    view.setUint16(dirOffset + 6, 32, true) // bits per pixel (advisory for PNG entries)
    view.setUint32(dirOffset + 8, e.png.length, true)
    view.setUint32(dirOffset + 12, dataOffset, true)
    out.set(e.png, dataOffset)
    dataOffset += e.png.length
    dirOffset += 16
  }
  return out
}
