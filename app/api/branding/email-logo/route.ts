import { createHash } from 'crypto'
import { publicUrl } from '@/lib/security/public-origin'
import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { prisma } from '@/lib/db/prisma'
import { downloadMedia } from '@/lib/media/upload'
import { EMAIL_SAFE_IMAGE_TYPES } from '@/lib/email/logo'

// The site logo as a PNG, for the top of an email.
//
// Gmail refuses to render an SVG at all and Outlook will not touch a WebP, so
// the logo that looks perfectly good on the site is a blank space in the inbox.
// lib/email/logo.ts sends anything that is not already PNG, JPEG or GIF here,
// and here it gets printed once and cached hard.
//
// The `v` parameter is the logo's version: its media id, plus a fingerprint of
// the file behind it. It carries no meaning to this route beyond cache-busting -
// the answer is always the CURRENT logo - but it does two useful things: a new
// logo is a new address, so nothing that cached the old picture keeps serving
// it, and a request naming anything else is bounced to the canonical address
// rather than being rendered, so a bored visitor cannot mint endless cache keys
// by inventing query strings.
//
// The id alone is not enough. "Replace file" in the media library keeps the item
// (and its id) and swaps the bytes, so an id-only address went on serving the old
// logo - a year, immutable, in every inbox and at the edge. Emails carry the bare
// id (lib/email/logo.ts) and are redirected here to the full version, so a mail
// sent before a replacement shows the new logo too.
//
// /api/branding/ bypasses every gate in proxy.ts, which is deliberate: mail goes
// out from sites that are in maintenance or not yet open, and the logo in it has
// to load anyway.
export const dynamic = 'force-dynamic'

// Wide enough for the 160-320px an email logo is displayed at on a retina
// screen, small enough that nobody is posting half a megabyte to show a
// letterhead.
const MAX_WIDTH = 640

// A warm serverless instance answering a second miss should not fetch and render
// the same picture twice. Cleared by nothing, because a changed logo arrives on a
// different media id and simply misses.
let rendered: { version: string; png: Buffer } | null = null

// The media id, plus a fingerprint of what currently answers to it: a replaced
// file changes its size (and, unless it kept its exact name and type, its url).
function logoVersion(logo: { id: string; url: string; sizeBytes: number; mimeType: string }): string {
  const print = createHash('sha1').update(`${logo.url}|${logo.sizeBytes}|${logo.mimeType}`).digest('hex').slice(0, 12)
  return `${logo.id}.${print}`
}

async function renderPng(source: Buffer): Promise<Buffer> {
  // An SVG is rasterised at 72dpi unless told otherwise, so a small drawing
  // would come out small and then be blown up. Asking for the density that
  // lands on MAX_WIDTH renders it at that size instead, which is the whole
  // point of having a vector in the first place.
  const probe = await sharp(source, { failOn: 'none' }).metadata()
  const nativeWidth = probe.width ?? 0
  const density = probe.format === 'svg' && nativeWidth > 0
    ? Math.min(2400, Math.max(72, Math.round((MAX_WIDTH / nativeWidth) * 72)))
    : 72
  return sharp(source, { failOn: 'none', density })
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .png()
    .toBuffer()
}

export async function GET(request: Request) {
  const config = await prisma.siteConfig
    .findUnique({ where: { id: 'singleton' }, select: { logoMediaId: true } })
    .catch(() => null)
  const logo = config?.logoMediaId
    ? await prisma.media
        .findUnique({
          where: { id: config.logoMediaId },
          select: { id: true, key: true, url: true, provider: true, mimeType: true, sizeBytes: true },
        })
        .catch(() => null)
    : null

  if (!logo || !logo.mimeType.startsWith('image/')) {
    return NextResponse.json({ error: 'No site logo is set.' }, { status: 404 })
  }

  const version = logoVersion(logo)
  const url = publicUrl(request)
  if (url.searchParams.get('v') !== version) {
    // Including the no-parameter case, so a hand-typed address still ends up on
    // the cacheable one - and the bare id an email carries.
    url.searchParams.set('v', version)
    const res = NextResponse.redirect(url, 307)
    res.headers.set('Cache-Control', 'public, max-age=300')
    return res
  }

  // Already a format every mail client draws: no reason to re-print it, and the
  // media provider's own CDN serves it better than this ever will.
  if (EMAIL_SAFE_IMAGE_TYPES.has(logo.mimeType)) {
    const res = NextResponse.redirect(publicUrl(request, logo.url), 307)
    res.headers.set('Cache-Control', 'public, max-age=86400')
    return res
  }

  try {
    const png = rendered?.version === version
      ? rendered.png
      : await downloadMedia(logo.provider, logo.key, logo.url).then(renderPng)
    rendered = { version, png }
    return new NextResponse(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        // The address carries the logo's version, so these bytes can never go
        // stale: a different logo, or a replaced file, is a different URL.
        'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
      },
    })
  } catch (error) {
    console.error('[branding] could not render the email logo:', error)
    // A client that copes with the original beats no logo at all, and one that
    // does not is no worse off than it was.
    return NextResponse.redirect(new URL(logo.url, request.url), 307)
  }
}
