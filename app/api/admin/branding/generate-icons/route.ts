import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { downloadMedia, uploadMedia, saveMediaRecord } from '@/lib/media/upload'
import type { MediaProviderType } from '@prisma/client'

// The icon set generated from a single square source image. Each becomes its own
// Media row so it can be swapped/overridden independently on the Branding tab.
const SIZES = [
  { key: 'favicon', size: 96, opaque: false, name: 'favicon.png' },
  // Apple flattens transparency to black, so the touch icon gets an opaque
  // white backing; the others keep their alpha (browsers/Android handle it).
  { key: 'appleTouch', size: 180, opaque: true, name: 'apple-touch-icon.png' },
  { key: 'icon192', size: 192, opaque: false, name: 'web-app-manifest-192x192.png' },
  { key: 'icon512', size: 512, opaque: false, name: 'web-app-manifest-512x512.png' },
] as const

async function renderIcon(source: Buffer, size: number, opaque: boolean): Promise<Buffer> {
  // 'contain' never crops the source (the field asks for a square image, so for
  // a square input this fills the frame); transparent padding otherwise.
  let img = sharp(source, { failOn: 'none' }).resize(size, size, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  if (opaque) img = img.flatten({ background: '#ffffff' })
  return img.png().toBuffer()
}

// Generates favicon / Apple touch / PWA icons from one uploaded source image and
// stores each as a new media row. Leaves the source untouched. Returns the new
// ids + urls; the Branding tab drops them into the config state and the top
// "Save changes" persists them (mirrors the "Optimise" button flow).
export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'media.upload')) return errorResponse('Forbidden', 403)

  const body = await request.json().catch(() => null)
  const sourceMediaId = body?.sourceMediaId
  if (typeof sourceMediaId !== 'string' || !sourceMediaId) return errorResponse('sourceMediaId is required')

  const source = await prisma.media.findUnique({ where: { id: sourceMediaId } })
  if (!source) return errorResponse('Source image not found', 404)
  if (!source.mimeType.startsWith('image/')) return errorResponse('The app icon must be an image.')

  const provider: MediaProviderType = source.provider

  try {
    const original = await downloadMedia(source.provider, source.key, source.url)

    const out: Record<string, { id: string; url: string }> = {}
    for (const spec of SIZES) {
      const buf = await renderIcon(original, spec.size, spec.opaque)
      const uploaded = await uploadMedia(buf, 'image/png', provider, spec.name)
      const record = await saveMediaRecord({
        key: uploaded.key,
        url: uploaded.url,
        provider,
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.sizeBytes,
        uploadedById: user.id,
        altText: `${spec.name} (generated)`,
      })
      out[spec.key] = { id: record.id, url: record.url }
    }

    return NextResponse.json({ ok: true, ...out })
  } catch (err: unknown) {
    return errorResponse(`Icon generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 500)
  }
}
