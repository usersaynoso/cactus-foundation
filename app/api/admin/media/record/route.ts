import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { saveMediaRecord, confirmedSizeBytes, autoOptimiseNewUpload } from '@/lib/media/upload'
import { prisma } from '@/lib/db/prisma'
import { getActiveMediaProvider, isMediaProviderConfigured } from '@/lib/config/env'
import { isDirectUploadType, contentTypeForKey, MAX_DIRECT_UPLOAD_BYTES, tooLargeReason, MAX_DIRECT_UPLOAD_MB } from '@/lib/media/limits'
import { verifyUploadToken } from '@/lib/media/upload-token'

// Record a Media row for a file the client already uploaded straight to the
// Worker (see /upload-url). The bytes are in storage; this only writes the DB
// row.
//
// Everything identifying the object is taken from values the server itself
// signed, not from the request body: the caller must hand back the upload token
// issued for this exact key, and the content type is derived from the key's
// extension. Trusting the body instead let a caller register a row pointing at
// any object under the media prefix, or one whose recorded type didn't match the
// bytes actually stored.
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
  const token = typeof body?.token === 'string' ? body.token : ''
  const sizeBytes = typeof body?.sizeBytes === 'number' ? body.sizeBytes : NaN
  const originalName = typeof body?.originalName === 'string' ? body.originalName : undefined
  const rawFolderId = body?.folderId
  const folderId = typeof rawFolderId === 'string' && rawFolderId ? rawFolderId : null
  const altText = typeof body?.altText === 'string' ? body.altText : undefined

  // The key must sit under this provider's own namespace - the same shape
  // buildKey() produced for /upload-url. B2 keeps the legacy prefix-less form.
  const expectedPrefix = provider === 'B2' ? 'media/' : `media/${provider}/`
  if (!key.startsWith(expectedPrefix)) return errorResponse('Invalid object key')

  // Proof this key is one we handed this session, still within its short life -
  // the same signature the Worker checked before it accepted the bytes.
  if (!token || !verifyUploadToken(key, token)) {
    return errorResponse('Invalid or expired upload token', 403)
  }

  // Type comes from the signed key, not from the body. The Worker stored the
  // object under exactly this type, so the row and the bytes cannot disagree.
  const contentType = contentTypeForKey(key)
  if (!contentType || !isDirectUploadType(contentType)) {
    return errorResponse('Unsupported content type')
  }

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return errorResponse('Invalid file size')
  if (sizeBytes > MAX_DIRECT_UPLOAD_BYTES) {
    return errorResponse(tooLargeReason(sizeBytes, MAX_DIRECT_UPLOAD_MB), 413)
  }

  try {
    // Size is the one thing left that came from the body, and the bytes never
    // passed through here to check it against. Ask storage what it actually
    // holds, so the library's totals describe the objects rather than the
    // client's account of them. The body value stays the cap check above (a
    // client understating its size cannot smuggle an oversized object past it —
    // the Worker enforces the same cap on the PUT).
    const storedSize = await confirmedSizeBytes(provider, key, sizeBytes)
    const record = await saveMediaRecord({
      key,
      url: '', // saveMediaRecord rebuilds the Worker url for proxied providers
      provider,
      mimeType: contentType,
      sizeBytes: storedSize,
      uploadedById: user.id,
      altText,
      originalName,
      folderId,
    })
    // A 3D model is compressed as it lands, so it is already the smaller file by
    // the time anyone opens the product page it belongs to. Returns the row as it
    // stands afterwards, because optimising rewrites its size and its optimised
    // flag and the library would otherwise render the pre-optimise numbers until
    // the next refresh. Everything else is returned untouched.
    const optimised = await autoOptimiseNewUpload(record.id, contentType, storedSize, user.id)
    if (optimised !== storedSize) {
      const fresh = await prisma.media.findUnique({ where: { id: record.id } })
      if (fresh) return NextResponse.json(fresh, { status: 201 })
    }
    return NextResponse.json(record, { status: 201 })
  } catch (err: unknown) {
    return errorResponse(`Save failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 500)
  }
}
