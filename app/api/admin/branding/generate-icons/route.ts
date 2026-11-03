import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { downloadMedia, uploadMedia, saveMediaRecord } from '@/lib/media/upload'
import { renderPng, looksLikeSvg } from '@/lib/config/favicon-render'
import { isSvgMime } from '@/lib/config/favicon-variants'
import type { MediaProviderType } from '@prisma/client'

// The stored icon set, generated from one square source image - PNG, JPEG,
// WebP, GIF or SVG. Each becomes its own Media row so it can be swapped or
// overridden independently on the Branding tab.
//
// Every row is saved as ALREADY OPTIMISED. These are exact-size PNGs on
// purpose: the media optimiser would turn them into WebP, and a WebP behind a
// .png address with a PNG label is exactly what WebKit's icon loader refuses.
// The optimiser also refuses them now (see optimiseMediaInPlace), but the flag is
// what keeps them out of the media library's "needs optimising" list.
//
// The site never depends on these files existing: the icon route draws every
// address from whatever icon is set (lib/config/favicon-variants.ts). What these
// buy is a set the admin can see, download and hand-replace one at a time.
//
// Hand-picked overrides stick. A slot whose current icon was uploaded by hand
// (anything not saved by this route, which labels its rows "(generated)") is
// left alone, unless the request says `force` - the Branding tab's "Remake the
// icon set" button, where redrawing everything is the point.
//
// Two scopes:
//   'all' - the app icon (source) was uploaded: everything is regenerated.
//   'tab' - the favicon itself was uploaded: just the 16 and 32 renditions are
//           redrawn from it, so the tab icon at every size is the picture the
//           admin just chose, and the app icons are left as they were.
const ALL = [
  { key: 'favicon16', size: 16, opaque: false, name: 'favicon-16x16.png' },
  { key: 'favicon32', size: 32, opaque: false, name: 'favicon-32x32.png' },
  { key: 'favicon', size: 96, opaque: false, name: 'favicon-96x96.png' },
  // Apple flattens transparency to black, so the touch icon is drawn onto the
  // site's background colour; the others keep their alpha.
  { key: 'appleTouch', size: 180, opaque: true, name: 'apple-touch-icon.png' },
  { key: 'icon192', size: 192, opaque: false, name: 'web-app-manifest-192x192.png' },
  { key: 'icon512', size: 512, opaque: false, name: 'web-app-manifest-512x512.png' },
] as const

type Spec = (typeof ALL)[number]

const COLUMN: Record<Spec['key'], 'favicon16MediaId' | 'favicon32MediaId' | 'faviconMediaId' | 'appleTouchIconMediaId' | 'webManifest192MediaId' | 'webManifest512MediaId'> = {
  favicon16: 'favicon16MediaId',
  favicon32: 'favicon32MediaId',
  favicon: 'faviconMediaId',
  appleTouch: 'appleTouchIconMediaId',
  icon192: 'webManifest192MediaId',
  icon512: 'webManifest512MediaId',
}

const GENERATED_SUFFIX = '(generated)'
type Generated = Partial<Record<Spec['key'], { id: string; url: string }>>

export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'media.upload')) return errorResponse('Forbidden', 403)

  const body = await request.json().catch(() => null)
  const sourceMediaId = body?.sourceMediaId
  if (typeof sourceMediaId !== 'string' || !sourceMediaId) return errorResponse('sourceMediaId is required')
  const scope: 'all' | 'tab' = body?.scope === 'tab' ? 'tab' : 'all'
  const force = body?.force === true

  const source = await prisma.media.findUnique({ where: { id: sourceMediaId } })
  if (!source) return errorResponse('Source image not found', 404)
  if (!source.mimeType.startsWith('image/')) return errorResponse('The icon must be an image.')

  const provider: MediaProviderType = source.provider

  try {
    const original = await downloadMedia(source.provider, source.key, source.url)
    const sourceIsSvg = isSvgMime(source.mimeType) || looksLikeSvg(original)

    // The source itself is kept exactly as uploaded and must not be re-encoded
    // either: every future regeneration starts from it. (SVG is never offered an
    // optimise in the first place, so there is nothing to mark.)
    if (!sourceIsSvg && !source.optimised) {
      await prisma.media.update({ where: { id: source.id }, data: { optimised: true } })
    }

    // An SVG source IS the favicon: modern browsers draw it crisp at every size,
    // and the icon route rasterises it for every address that has to be a PNG or
    // an ICO. A raster source gets a 96px PNG favicon drawn from it. For the
    // 'tab' scope the uploaded image is already the favicon.
    const config = await prisma.siteConfig.findUnique({ where: { id: 'singleton' } })
    const background = config?.backgroundColor?.trim() || '#ffffff'

    // Which slots currently hold a hand-picked icon. Neither the new source nor
    // the previous app icon counts: an SVG app icon IS the favicon, so the old
    // one sitting in the favicon slot is the last generation, not an override.
    const currentIds = Object.values(COLUMN).map((c) => config?.[c]).filter((id): id is string => !!id)
    const current = currentIds.length
      ? await prisma.media.findMany({ where: { id: { in: currentIds } }, select: { id: true, altText: true } })
      : []
    const handPicked = new Set(
      current
        .filter((m) => m.id !== source.id && m.id !== config?.appIconMediaId && !(m.altText ?? '').endsWith(GENERATED_SUFFIX))
        .map((m) => m.id),
    )
    const keep = (key: Spec['key']) => {
      if (force) return false
      const id = config?.[COLUMN[key]]
      return !!id && handPicked.has(id)
    }

    const specs: readonly Spec[] = (
      scope === 'tab'
        ? ALL.filter((s) => s.key === 'favicon16' || s.key === 'favicon32')
        : ALL.filter((s) => !(sourceIsSvg && s.key === 'favicon'))
    ).filter((s) => !keep(s.key))

    const out: Generated = {}
    for (const spec of specs) {
      const buf = await renderPng(original, spec.size, spec.opaque ? background : undefined)
      const uploaded = await uploadMedia(buf, 'image/png', provider, spec.name)
      const record = await saveMediaRecord({
        key: uploaded.key,
        url: uploaded.url,
        provider,
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.sizeBytes,
        uploadedById: user.id,
        altText: `${spec.name} ${GENERATED_SUFFIX}`,
        optimised: true,
        dimensions: { width: spec.size, height: spec.size },
      })
      out[spec.key] = { id: record.id, url: record.url }
    }
    if (scope === 'all' && sourceIsSvg && !keep('favicon')) out.favicon = { id: source.id, url: source.url }

    const kept = ALL.filter((s) => keep(s.key)).map((s) => s.key)
    return NextResponse.json({ ok: true, scope, sourceIsSvg, kept, ...out })
  } catch (err: unknown) {
    return errorResponse(`Icon generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 500)
  }
}
