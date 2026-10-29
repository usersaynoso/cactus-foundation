import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { getActiveMediaProvider, missingMediaEnvKeys } from '@/lib/config/env'
import { CLOUDFLARE_WORKER_VAR } from '@/lib/media/providers'
import { canServeDirect } from '@/lib/media/serving-mode'
import { presignMediaRead, presignMediaUpload } from '@/lib/media/presign'
import { deleteMedia, mediaKeyPrefix } from '@/lib/media/upload'

// "Test CORS" on Settings → Media, for direct serving mode.
//
// A large upload in direct mode is PUT by the browser straight to the bucket, and
// a 3D model is fetched from it by script. Both need the bucket's CORS rules to
// let this site's origin in, which is set in the provider's console and which the
// site cannot see from the server. So the browser tries it for real: POST hands
// out a presigned PUT and GET for a throwaway object, the page sends a few bytes
// up and reads them back, and DELETE removes the object whatever happened.
//
// The probe lives under the provider's media prefix in a folder of its own, so a
// probe stranded by a closed tab shows up in the storage check rather than
// anywhere a visitor could meet it.

const PROBE_FOLDER = '.cors-check'
const PROBE_TYPE = 'application/octet-stream'
const PROBE_BODY = 'cactus-cors-check'

function probePrefix(prefix: string): string {
  return `${prefix}${PROBE_FOLDER}/`
}

async function authorise() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!(await hasPermission(user, 'config.manage'))) return errorResponse('Forbidden', 403)
  return null
}

async function activeS3Provider() {
  const provider = await getActiveMediaProvider()
  if (!provider || !canServeDirect(provider)) return { error: errorResponse('The CORS check is for S3-style storage (B2, R2, S3, Spaces, Wasabi or MinIO).', 400) }
  const missing = missingMediaEnvKeys(provider).filter((k) => k !== CLOUDFLARE_WORKER_VAR.key)
  if (missing.length > 0) return { error: errorResponse(`Save the storage credentials first - still missing ${missing.join(', ')}.`, 400) }
  return { provider }
}

export async function POST() {
  const denied = await authorise()
  if (denied) return denied
  const active = await activeS3Provider()
  if ('error' in active) return active.error
  const { provider } = active

  // The extension is .bin so the read is typed as an opaque file, the same as the
  // Worker would type it.
  const key = `${probePrefix(mediaKeyPrefix(provider))}${randomUUID()}.bin`
  try {
    const putUrl = await presignMediaUpload(provider, key, PROBE_TYPE, new TextEncoder().encode(PROBE_BODY).length)
    const getUrl = await presignMediaRead(provider, key, { method: 'GET', contentType: PROBE_TYPE, cacheControl: 'no-store' })
    return NextResponse.json({ key, putUrl, getUrl, contentType: PROBE_TYPE, body: PROBE_BODY })
  } catch (err: unknown) {
    return errorResponse(`Could not sign a test upload: ${err instanceof Error ? err.message : 'unknown error'}`, 502)
  }
}

const DeleteBody = z.object({ key: z.string().min(1).max(512) })

export async function DELETE(request: NextRequest) {
  const denied = await authorise()
  if (denied) return denied
  const active = await activeS3Provider()
  if ('error' in active) return active.error
  const { provider } = active

  const parsed = DeleteBody.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return errorResponse('Invalid request', 400)
  const { key } = parsed.data
  // Only ever a probe this route could have made - never an arbitrary object.
  const prefix = probePrefix(mediaKeyPrefix(provider))
  if (!key.startsWith(prefix) || key.slice(prefix.length).includes('/')) return errorResponse('Not a CORS check file', 400)

  try {
    await deleteMedia(provider, key)
  } catch {
    // Not there (the PUT never landed) is the common case and is fine.
  }
  return NextResponse.json({ ok: true })
}
