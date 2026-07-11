import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { saveMediaRecord } from '@/lib/media/upload'
import { getActiveMediaProvider, isMediaProviderConfigured } from '@/lib/config/env'
import { isRasterDirectType } from '@/lib/media/limits'

// Record a Media row for a file the client already uploaded straight to the
// Worker (see /upload-url). The bytes are in storage; this only writes the DB
// row. Not a general-purpose endpoint: it accepts raster images under the active
// provider's own key namespace, mirroring what /upload-url handed out, so a
// stray or spoofed key can't register a row pointing anywhere in the bucket.
export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'media.upload')) return errorResponse('Forbidden', 403)

  const provider = await getActiveMediaProvider()
  if (!provider || !isMediaProviderConfigured(provider)) {
    return errorResponse('Media storage is not configured.', 503)
  }

  const body = await request.json().catch(() => null)
  const key = typeof body?.key === 'string' ? body.key : ''
  const contentType = typeof body?.contentType === 'string' ? body.contentType : ''
  const sizeBytes = typeof body?.sizeBytes === 'number' ? body.sizeBytes : NaN
  const originalName = typeof body?.originalName === 'string' ? body.originalName : undefined
  const rawFolderId = body?.folderId
  const folderId = typeof rawFolderId === 'string' && rawFolderId ? rawFolderId : null
  const altText = typeof body?.altText === 'string' ? body.altText : undefined

  if (!isRasterDirectType(contentType)) return errorResponse('Unsupported content type')
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return errorResponse('Invalid file size')

  // The key must sit under this provider's own namespace - the same shape
  // buildKey() produced for /upload-url. B2 keeps the legacy prefix-less form.
  const expectedPrefix = provider === 'B2' ? 'media/' : `media/${provider}/`
  if (!key.startsWith(expectedPrefix)) return errorResponse('Invalid object key')

  try {
    const record = await saveMediaRecord({
      key,
      url: '', // saveMediaRecord rebuilds the Worker url for proxied providers
      provider,
      mimeType: contentType,
      sizeBytes,
      uploadedById: user.id,
      altText,
      originalName,
      folderId,
    })
    return NextResponse.json(record, { status: 201 })
  } catch (err: unknown) {
    return errorResponse(`Save failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 500)
  }
}
