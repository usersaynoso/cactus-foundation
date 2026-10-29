import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { buildLibraryUploadKey, isS3Provider, workerUrl, planMediaReplacement, MediaReplaceTypeError } from '@/lib/media/upload'
import { resolveFolderPath } from '@/lib/media/organise'
import { getActiveMediaProvider, isMediaProviderConfigured, mediaNotConfiguredMessage } from '@/lib/config/env'
import { signUploadToken, UPLOAD_TOKEN_TTL_MS } from '@/lib/media/upload-token'
import { isDirectUploadType, MAX_DIRECT_UPLOAD_BYTES, MAX_DIRECT_UPLOAD_MB, tooLargeReason } from '@/lib/media/limits'
import { servesDirect } from '@/lib/media/serving-mode'
import { directUploadTarget } from '@/lib/media/direct-upload-target'

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
//
// In direct serving mode (lib/media/serving-mode.ts) there is no Worker to PUT
// to, so the target is a presigned PUT on the bucket itself, flagged
// `presigned: true` so the client sends no Authorization header (S3 refuses a
// request carrying two kinds of authentication). The token is still issued and
// still checked by /record - it is what ties the row to a key this app chose.
export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'media.upload')) return errorResponse('Forbidden', 403)

  const provider = await getActiveMediaProvider()
  if (!provider || !isMediaProviderConfigured(provider)) {
    return errorResponse(mediaNotConfiguredMessage(provider), 503)
  }

  const base = workerUrl()
  const body = await request.json().catch(() => null)
  const contentType = typeof body?.contentType === 'string' ? body.contentType : ''
  const filename = typeof body?.filename === 'string' ? body.filename : undefined
  const rawFolderId = body?.folderId
  const folderId = typeof rawFolderId === 'string' && rawFolderId ? rawFolderId : null
  const replaceId = typeof body?.replaceId === 'string' && body.replaceId ? body.replaceId : null
  const sizeBytes = typeof body?.sizeBytes === 'number' ? body.sizeBytes : NaN
  const direct = servesDirect(provider)

  // The direct path is only wired for the S3-compatible family (the Worker signs
  // those writes) and only for raster images and 3D models - SVGs must be
  // sanitised on the server. Anything else, or a Worker URL that isn't
  // configured, means the client should fall back.
  if ((!base && !direct) || !isS3Provider(provider) || !isDirectUploadType(contentType)) {
    return NextResponse.json({ available: false })
  }

  // A presigned PUT carries its length in the signature, so the size has to be
  // known - and within the ceiling - before one is handed out. A client too old
  // to send it simply takes the serverless path.
  if (direct) {
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return NextResponse.json({ available: false })
    if (sizeBytes > MAX_DIRECT_UPLOAD_BYTES) return errorResponse(tooLargeReason(sizeBytes, MAX_DIRECT_UPLOAD_MB), 413)
  }
  const target = async (key: string) => {
    const t = await directUploadTarget(provider, key, contentType, direct ? sizeBytes : undefined)
    if (!t) throw new Error('No direct upload target')
    return t.presigned ? t : { uploadUrl: t.uploadUrl }
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
      // A bucket PUT lands the moment it arrives, with no Worker in front to
      // refuse it first. Aimed at the item's own key, a bad upload would have
      // already overwritten the original before anything could check it, so in
      // direct mode an in-place replace goes the serverless way, which checks the
      // bytes before it writes.
      if (direct && plan.key === media.key) return NextResponse.json({ available: false })
      const { token } = signUploadToken(plan.key, UPLOAD_TOKEN_TTL_MS)
      return NextResponse.json({ available: true, ...(await target(plan.key)), key: plan.key, token })
    } catch (err: unknown) {
      // A replacement that would have to rename the file is a dead end on both
      // paths - say so now rather than after the client has pushed the whole file
      // up to be told the same thing.
      if (err instanceof MediaReplaceTypeError) return errorResponse(err.message, 409)
      throw err
    }
  }

  const folderPath = folderId ? await resolveFolderPath(folderId) : ''
  const key = await buildLibraryUploadKey(provider, contentType, filename, folderPath || undefined)
  const { token } = signUploadToken(key, UPLOAD_TOKEN_TTL_MS)

  return NextResponse.json({
    available: true,
    ...(await target(key)),
    key,
    token,
  })
}
