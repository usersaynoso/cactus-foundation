import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { optimiseMediaInPlace } from '@/lib/media/upload'

type Ctx = { params: Promise<{ id: string }> }

// Optimise a single media item in place: re-encode to WebP, swap the blob, keep
// the row's id (and every reference to it) intact, delete the original. Distinct
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
