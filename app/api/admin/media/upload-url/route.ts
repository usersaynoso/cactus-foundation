import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { buildKey, isS3Provider, workerUrl } from '@/lib/media/upload'
import { resolveFolderPath } from '@/lib/media/organise'
import { getActiveMediaProvider, isMediaProviderConfigured } from '@/lib/config/env'
import { signUploadToken, UPLOAD_TOKEN_TTL_MS } from '@/lib/media/upload-token'
import { isRasterDirectType } from '@/lib/media/limits'

// Issue a signed, single-use-ish target for a direct-to-Worker upload. The
// client PUTs the file bytes straight to the Worker (bypassing the serverless
// body-size cap) and then calls /record to save the row. Returns
// { available: false } whenever the direct path can't be used for this request,
// so the client transparently falls back to the size-guarded serverless upload.
export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'media.upload')) return errorResponse('Forbidden', 403)

  const provider = await getActiveMediaProvider()
  if (!provider || !isMediaProviderConfigured(provider)) {
    return errorResponse('Media storage is not configured. Select a provider and add its credentials in Settings → Media.', 503)
  }

  const base = workerUrl()
  const body = await request.json().catch(() => null)
  const contentType = typeof body?.contentType === 'string' ? body.contentType : ''
  const filename = typeof body?.filename === 'string' ? body.filename : undefined
  const rawFolderId = body?.folderId
  const folderId = typeof rawFolderId === 'string' && rawFolderId ? rawFolderId : null

  // The direct path is only wired for the S3-compatible family (the Worker signs
  // those writes) and only for raster images (SVGs must be sanitised on the
  // server). Anything else, or a Worker URL that isn't configured, means the
  // client should fall back.
  if (!base || !isS3Provider(provider) || !isRasterDirectType(contentType)) {
    return NextResponse.json({ available: false })
  }

  const folderPath = folderId ? await resolveFolderPath(folderId) : ''
  const key = buildKey(provider, contentType, filename, folderPath || undefined)
  const { token } = signUploadToken(key, UPLOAD_TOKEN_TTL_MS)

  return NextResponse.json({
    available: true,
    uploadUrl: `${base}/${key}`,
    key,
    token,
  })
}
