import sharp from 'sharp'
import { buildIco, pngDimensions } from '@/lib/config/favicon-ico'

// Draws an icon at exactly the size and format an address promises, from
// whatever the admin uploaded: PNG, JPEG, WebP, GIF or SVG, any size. Shared by
// the icon route (which draws on request) and the Branding tab's generator
// (which stores the same drawings as media), so a stored rendition and a drawn
// one can never disagree.

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47]

export function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((b, i) => bytes[i] === b)
}

// Sniffed from the bytes rather than trusted from a mime type, because the mime
// on a media row is a label somebody wrote and the bytes are the truth.
export function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = Buffer.from(bytes.subarray(0, 1024)).toString('utf8').replace(/^﻿/, '').trimStart()
  return /^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(head)
}

/**
 * A square PNG of exactly `size` pixels. Never crops ('contain', transparent
 * padding), and an SVG is rasterised at a density that makes the target size
 * from real vectors rather than by blowing up a 72dpi bitmap.
 *
 * `background` flattens transparency onto a colour: Apple fills a transparent
 * touch icon with black, so that one is drawn onto the site's background colour.
 */
export async function renderPng(source: Uint8Array, size: number, background?: string): Promise<Buffer> {
  const input = Buffer.from(source)
  let density: number | undefined
  if (looksLikeSvg(input)) {
    const meta = await sharp(input, { failOn: 'none' }).metadata()
    const natural = Math.max(meta.width ?? size, meta.height ?? size, 1)
    // 72dpi is sharp's natural SVG density. Scale it so the long edge comes out
    // at (at least) the target, then let the resize do the rest. Clamped so a
    // tiny viewBox cannot ask librsvg for a gigapixel canvas.
    density = Math.min(Math.max(Math.ceil((72 * size * 2) / natural), 72), 2400)
  }
  let img = sharp(input, { failOn: 'none', animated: false, ...(density ? { density } : {}) }).resize(size, size, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  if (background) img = img.flatten({ background })
  return img.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer()
}

/**
 * The same, but answers with the source bytes untouched when they are already a
 * PNG of exactly the right size - a hand-picked 16px rendition stays pixel for
 * pixel what the admin chose.
 */
export async function ensurePng(source: Uint8Array, size: number, background?: string): Promise<Buffer> {
  if (!background && isPng(source)) {
    const dims = pngDimensions(source)
    if (dims && dims.width === size && dims.height === size) return Buffer.from(source)
  }
  return renderPng(source, size, background)
}

/** A real ICO container holding one PNG per entry. */
export function composeIco(pngs: Uint8Array[]): Buffer | null {
  const ico = buildIco(pngs)
  return ico ? Buffer.from(ico) : null
}
