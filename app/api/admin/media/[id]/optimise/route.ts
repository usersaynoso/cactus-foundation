import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { optimiseMediaInPlace } from '@/lib/media/upload'

type Ctx = { params: Promise<{ id: string }> }

// A 3D model takes far longer to optimise than an image - it is a decompress,
// several graph passes, a texture re-encode and a vertex re-compress over a file
// that can be tens of megabytes, where an image is one sharp call. The default
// ceiling is comfortable for the image path and not for this one, and a request
// cut off partway through simply reports a failure the admin cannot act on.
export const maxDuration = 60

// Optimise a single media item in place: compress it, swap the blob, keep the
// row's id (and every reference to it) intact. An image is re-encoded to WebP
// under a new key with its old blob deleted; a 3D model is written back over its
// own key (see optimiseModelInPlace for why the difference matters). Distinct
// from the Branding tab's /api/admin/media/optimise, which mints a new row.
export async function POST(_request: NextRequest, { params }: Ctx) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'media.upload')) return errorResponse('Forbidden', 403)

  const { id } = await params
  if (!id) return errorResponse('Media ID required')

  try {
    const result = await optimiseMediaInPlace(id, user.id)
    return NextResponse.json(result)
  } catch (err: unknown) {
    return errorResponse(`Optimise failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 500)
  }
}
