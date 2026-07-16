import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { changeMediaAspectRatio } from '@/lib/media/upload'
import { parseAspectRequest } from '@/lib/media/aspect-request'

type Ctx = { params: Promise<{ id: string }> }

// Reshape a single raster image to a target aspect ratio. Body:
//   { ratioW, ratioH, fill: { kind: 'blur' | 'transparent' | 'colour', colour? },
//     mode: 'replace' | 'new', newName? }
// The image is padded out to the new shape, never cropped or stretched.
// 'replace' swaps the blob under the existing row (id and every reference
// preserved); 'new' mints a fresh library item and leaves the original alone.
export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'media.upload')) return errorResponse('Forbidden', 403)

  const { id } = await params
  if (!id) return errorResponse('Media ID required')

  const body = await request.json().catch(() => null)
  const parsed = parseAspectRequest(body)
  if (!parsed.ok) return errorResponse(parsed.error)

  const newName = typeof (body as Record<string, unknown>)?.newName === 'string' ? (body as Record<string, string>).newName : undefined
  if (parsed.value.mode === 'new' && !newName?.trim()) {
    return errorResponse('newName is required when saving as a new image')
  }

  try {
    const result = await changeMediaAspectRatio(id, { ...parsed.value, newName }, user.id)
    return NextResponse.json({ ok: true, ...result })
  } catch (err: unknown) {
    return errorResponse(`Ratio change failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 500)
  }
}
