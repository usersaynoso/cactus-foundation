import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { editMediaImage, type CropRect } from '@/lib/media/upload'

type Ctx = { params: Promise<{ id: string }> }

// Crop / edit a single raster image. Body:
//   { crop: { left, top, width, height }, mode: 'replace' | 'new', newName? }
// The crop rectangle is in the source image's own pixels. 'replace' swaps the
// blob under the existing row (id and every reference preserved); 'new' mints a
// fresh library item in the same folder and leaves the original alone.
export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'media.upload')) return errorResponse('Forbidden', 403)

  const { id } = await params
  if (!id) return errorResponse('Media ID required')

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return errorResponse('Invalid body')

  const mode = body.mode
  if (mode !== 'replace' && mode !== 'new') return errorResponse("mode must be 'replace' or 'new'")

  const c = body.crop
  const nums = ['left', 'top', 'width', 'height'] as const
  if (!c || typeof c !== 'object' || nums.some((k) => typeof c[k] !== 'number' || !Number.isFinite(c[k]))) {
    return errorResponse('crop must be { left, top, width, height } numbers')
  }
  if (c.width <= 0 || c.height <= 0) return errorResponse('crop width and height must be positive')

  const crop: CropRect = { left: c.left, top: c.top, width: c.width, height: c.height }
  const newName = typeof body.newName === 'string' ? body.newName : undefined
  if (mode === 'new' && (!newName || !newName.trim())) return errorResponse('newName is required when saving as a new image')

  try {
    const item = await editMediaImage(id, crop, { mode, newName }, user.id)
    return NextResponse.json({ ok: true, item })
  } catch (err: unknown) {
    return errorResponse(`Edit failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 500)
  }
}
