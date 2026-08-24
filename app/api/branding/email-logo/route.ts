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
// The `v` parameter is the logo's media id. It carries no meaning to this route
// beyond cache-busting - the answer is always the CURRENT logo - but it does two
// useful things: a new logo is a new address, so nothing that cached the old
// picture keeps serving it, and a request naming anything else is bounced to the
// canonical address rather than being rendered, so a bored visitor cannot mint
// endless cache keys by inventing query strings.
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
let rendered: { mediaId: string; png: Buffer } | null = null

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
          select: { id: true, key: true, url: true, provider: true, mimeType: true },
        })
        .catch(() => null)
    : null

  if (!logo || !logo.mimeType.startsWith('image/')) {
    return NextResponse.json({ error: 'No site logo is set.' }, { status: 404 })
  }

  const url = new URL(request.url)
  if (url.searchParams.get('v') !== logo.id) {
    // Including the no-parameter case, so a hand-typed address still ends up on
    // the cacheable one.
    url.searchParams.set('v', logo.id)
    const res = NextResponse.redirect(url, 307)
    res.headers.set('Cache-Control', 'public, max-age=300')
    return res
  }

  // Already a format every mail client draws: no reason to re-print it, and the
  // media provider's own CDN serves it better than this ever will.
  if (EMAIL_SAFE_IMAGE_TYPES.has(logo.mimeType)) {
    const res = NextResponse.redirect(new URL(logo.url, request.url), 307)
    res.headers.set('Cache-Control', 'public, max-age=86400')
    return res
  }

  try {
    const png = rendered?.mediaId === logo.id
      ? rendered.png
      : await downloadMedia(logo.provider, logo.key, logo.url).then(renderPng)
    rendered = { mediaId: logo.id, png }
    return new NextResponse(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        // The address carries the media id, so these bytes can never go stale:
        // a different logo is a different URL.
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
