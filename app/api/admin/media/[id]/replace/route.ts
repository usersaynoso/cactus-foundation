import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import {
  validateUpload,
  replaceMediaFile,
  adoptReplacementBlob,
  planMediaReplacement,
  MediaReplaceTypeError,
} from '@/lib/media/upload'
import { isMediaProviderConfigured } from '@/lib/config/env'
import { verifyUploadToken } from '@/lib/media/upload-token'
import {
  contentTypeForKey,
  isRasterDirectType,
  MAX_DIRECT_UPLOAD_BYTES,
  MAX_DIRECT_UPLOAD_MB,
  tooLargeReason,
} from '@/lib/media/limits'

type Ctx = { params: Promise<{ id: string }> }

// Swap an existing item's file for a fresh one, keeping the item. Same row, same
// id, same name, same folder, same alt text and tags - so every page, product and
// setting pointing at it keeps working and simply shows the new picture.
//
// Two request shapes, mirroring the two upload paths (see lib/media/upload-client.ts):
//
//   multipart form-data { file }        - the serverless path. The bytes come
//                                         through here, so validateUpload sees
//                                         them: real image, SVG sanitised, under
//                                         the platform's body cap.
//   json { key, token, sizeBytes }      - the direct path. The client already PUT
//                                         the bytes to the Worker at a key this
//                                         app signed for this exact item; only the
//                                         row and its references still have to move.
export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'media.upload')) return errorResponse('Forbidden', 403)

  const { id } = await params
  if (!id) return errorResponse('Media ID required')

  const media = await prisma.media.findUnique({ where: { id } })
  if (!media) return errorResponse('Not found', 404)

  // The new blob goes where the row already lives, not to the active selection -
  // so it's that provider's credentials that have to be present.
  if (!isMediaProviderConfigured(media.provider)) {
    return errorResponse('The storage this item lives on is not configured. Add its credentials in Settings → Media.', 503)
  }

  try {
    const isDirect = (request.headers.get('content-type') ?? '').includes('application/json')
    const item = isDirect ? await adoptDirect(request, media) : await replaceFromForm(request, media)
    return NextResponse.json({ ok: true, item })
  } catch (err: unknown) {
    if (err instanceof MediaReplaceTypeError) return errorResponse(err.message, 409)
    if (err instanceof BadRequest) return errorResponse(err.message, err.status)
    return errorResponse(`Replace failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 500)
  }
}

// A caller mistake worth reporting as itself rather than as a 500.
class BadRequest extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

type MediaRow = NonNullable<Awaited<ReturnType<typeof prisma.media.findUnique>>>

// Serverless path: the file is in the request body, so it gets the same scrutiny
// a fresh upload does before it is allowed to take over an existing item.
async function replaceFromForm(request: NextRequest, media: MediaRow) {
  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) throw new BadRequest('No file provided')

  const buffer = Buffer.from(await file.arrayBuffer())
  const validation = await validateUpload(file.type, buffer.length, buffer)
  if (!validation.valid) throw new BadRequest(validation.reason)

  return replaceMediaFile(media, validation.buffer, file.type)
}

// Direct path: the bytes are already in storage. Everything that decides where
// the row points is taken from values this app signed, never from the body - the
// same rule /record follows, and for the same reason: trusting the body would let
// a caller aim an existing row at any object under the media prefix.
async function adoptDirect(request: NextRequest, media: MediaRow) {
  const body = await request.json().catch(() => null)
  const key = typeof body?.key === 'string' ? body.key : ''
  const token = typeof body?.token === 'string' ? body.token : ''
  const sizeBytes = typeof body?.sizeBytes === 'number' ? body.sizeBytes : NaN

  // Proof this key is one we handed out for a replacement, still within its short
  // life - the same signature the Worker checked before it accepted the bytes.
  if (!key || !token || !verifyUploadToken(key, token)) {
    throw new BadRequest('Invalid or expired upload token', 403)
  }

  // Type comes from the signed key, not the body. The Worker stored the object
  // under exactly this type, so the row and the bytes cannot disagree.
  const contentType = contentTypeForKey(key)
  if (!contentType || !isRasterDirectType(contentType)) throw new BadRequest('Unsupported content type')

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) throw new BadRequest('Invalid file size')
  if (sizeBytes > MAX_DIRECT_UPLOAD_BYTES) throw new BadRequest(tooLargeReason(sizeBytes, MAX_DIRECT_UPLOAD_MB), 413)

  // Re-plan from the row itself and check the key against it. A valid token only
  // proves this app issued the key for someone with media.upload - not that it
  // issued it for THIS item. The plan says which directory the item's blob has to
  // sit in (a key from a plain upload would quietly move it to another folder),
  // and, for an exact-named item, the one key it is allowed to occupy at all.
  const plan = await planMediaReplacement(media, contentType)
  const dirOf = (k: string) => k.slice(0, k.lastIndexOf('/'))
  if (dirOf(key) !== dirOf(plan.key)) throw new BadRequest('Invalid object key')
  if (plan.exactName && key !== plan.key) throw new BadRequest('Invalid object key')

  return adoptReplacementBlob(media, key, contentType, sizeBytes, plan.originalName)
}
