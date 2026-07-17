import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { resizeMediaImage } from '@/lib/media/upload'
import { parseResizeRequest } from '@/lib/media/resize-request'

type Ctx = { params: Promise<{ id: string }> }

// Resize a single raster image to fit inside a box. Body:
//   { width?, height?, mode: 'replace' | 'new', newName? }
// At least one of width/height is required; the image keeps its own ratio and is
// never enlarged, so the box is a ceiling rather than a target.
// 'replace' swaps the blob under the existing row (id and every reference
// preserved); 'new' mints a fresh library item and leaves the original alone.
export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'media.upload')) return errorResponse('Forbidden', 403)

  const { id } = await params
  if (!id) return errorResponse('Media ID required')

  const body = await request.json().catch(() => null)
  const parsed = parseResizeRequest(body)
  if (!parsed.ok) return errorResponse(parsed.error)

  const newName = typeof (body as Record<string, unknown>)?.newName === 'string' ? (body as Record<string, string>).newName : undefined
  if (parsed.value.mode === 'new' && !newName?.trim()) {
    return errorResponse('newName is required when saving as a new image')
  }

  try {
    const { width, height, mode } = parsed.value
    const result = await resizeMediaImage(id, { box: { width, height }, mode, newName }, user.id)
    return NextResponse.json({ ok: true, ...result })
  } catch (err: unknown) {
    return errorResponse(`Resize failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 500)
  }
}
