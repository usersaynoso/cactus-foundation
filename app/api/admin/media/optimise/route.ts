import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { downloadMedia, uploadMedia, saveMediaRecord } from '@/lib/media/upload'

// Largest dimension (px) an optimised logo is scaled down to. Generous enough to
// stay crisp on high-density displays while cutting oversized source art down to
// a sensible weight. Images already smaller than this are never enlarged.
const MAX_DIMENSION = 1024

// Produces a resized, WebP-compressed copy of an existing media item and stores
// it as a new media row. Used by the Branding tab's "Optimise" button. Leaves the
// original untouched (it may still be referenced elsewhere); the caller decides
// whether to point the logo at the new, lighter version.
export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'media.upload')) return errorResponse('Forbidden', 403)

  const body = await request.json().catch(() => null)
  const mediaId = body?.mediaId
  if (typeof mediaId !== 'string' || !mediaId) return errorResponse('mediaId is required')

  const media = await prisma.media.findUnique({ where: { id: mediaId } })
  if (!media) return errorResponse('Media item not found', 404)
  if (!media.mimeType.startsWith('image/')) {
    return errorResponse('Only images can be optimised.')
  }

  try {
    const original = await downloadMedia(media.provider, media.key, media.url)

    // Animated sources (e.g. GIF) keep their frames; static images pass through
    // as a single frame. Lossless WebP so the logo is pixel-for-pixel identical
    // (no compression artefacts on the hard edges and text logos tend to have) -
    // the downscale is what does the real weight-saving, and lossless WebP of a
    // resized logo is still typically a fraction of the original PNG/JPEG.
    const optimised = await sharp(original, { animated: true })
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
      .webp({ lossless: true, effort: 6 })
      .toBuffer()

    const before = original.length
    const after = optimised.length

    // If compression did not actually help (source was already tiny/optimised),
    // keep the original rather than swapping in a larger file.
    if (after >= before) {
      return NextResponse.json({ optimised: false, before, after })
    }

    const result = await uploadMedia(optimised, 'image/webp', media.provider, 'logo-optimised.webp')
    const record = await saveMediaRecord({
      key: result.key,
      url: result.url,
      provider: media.provider,
      mimeType: result.mimeType,
      sizeBytes: result.sizeBytes,
      uploadedById: user.id,
      altText: media.altText ?? undefined,
    })

    return NextResponse.json({ optimised: true, id: record.id, url: record.url, before, after })
  } catch (err: unknown) {
    return errorResponse(`Optimise failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 500)
  }
}
