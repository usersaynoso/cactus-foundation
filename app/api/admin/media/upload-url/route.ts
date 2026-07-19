import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { buildKey, isS3Provider, workerUrl, planMediaReplacement, MediaReplaceTypeError } from '@/lib/media/upload'
import { resolveFolderPath } from '@/lib/media/organise'
import { getActiveMediaProvider, isMediaProviderConfigured } from '@/lib/config/env'
import { signUploadToken, UPLOAD_TOKEN_TTL_MS } from '@/lib/media/upload-token'
import { isDirectUploadType } from '@/lib/media/limits'

// Issue a signed, single-use-ish target for a direct-to-Worker upload. The
// client PUTs the file bytes straight to the Worker (bypassing the serverless
// body-size cap) and then calls /record to save the row. Returns
// { available: false } whenever the direct path can't be used for this request,
// so the client transparently falls back to the size-guarded serverless upload.
//
// `replaceId` aims the same machinery at an item that already exists: the bytes
// are going to take over that row rather than start a new one, so the key is the
// one planMediaReplacement dictates (the item's own folder and name) and the
// caller finishes at /[id]/replace instead of /record.
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
  const replaceId = typeof body?.replaceId === 'string' && body.replaceId ? body.replaceId : null

  // The direct path is only wired for the S3-compatible family (the Worker signs
  // those writes) and only for raster images and 3D models - SVGs must be
  // sanitised on the server. Anything else, or a Worker URL that isn't
  // configured, means the client should fall back.
  if (!base || !isS3Provider(provider) || !isDirectUploadType(contentType)) {
    return NextResponse.json({ available: false })
  }

  if (replaceId) {
    const media = await prisma.media.findUnique({ where: { id: replaceId } })
    if (!media) return errorResponse('Media item not found', 404)
    // The Worker only carries the ACTIVE provider's credentials, so it can only
    // write where the active provider points. An item still sitting on a provider
    // the site has since moved off has to take the serverless path, which writes
    // with the app's own credentials to wherever the row actually lives.
    if (media.provider !== provider) return NextResponse.json({ available: false })

    try {
      const plan = await planMediaReplacement(media, contentType)
      const { token } = signUploadToken(plan.key, UPLOAD_TOKEN_TTL_MS)
      return NextResponse.json({ available: true, uploadUrl: `${base}/${plan.key}`, key: plan.key, token })
    } catch (err: unknown) {
      // A replacement that would have to rename the file is a dead end on both
      // paths - say so now rather than after the client has pushed the whole file
      // up to be told the same thing.
      if (err instanceof MediaReplaceTypeError) return errorResponse(err.message, 409)
      throw err
    }
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
