import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { deleteMedia, getMediaReferences } from '@/lib/media/upload'

type Ctx = { params: Promise<{ id: string }> }

// Mirrors the DELETE handler in ../route.ts (query-param form), for the
// MediaDelete component which calls DELETE /api/admin/media/<id> as a path param.
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'media.delete')) return errorResponse('Forbidden', 403)

  const { id } = await params
  if (!id) return errorResponse('Media ID required')

  const media = await prisma.media.findUnique({ where: { id } })
  if (!media) return errorResponse('Not found', 404)

  // Check references — warn if the item is still in use
  const refs = await getMediaReferences(id)
  if (refs.length > 0) {
    const force = request.nextUrl.searchParams.get('force') === 'true'
    if (!force) {
      return NextResponse.json(
        { error: 'This media item is still in use', references: refs },
        { status: 409 }
      )
    }
  }

  // Delete from the provider the row actually lives on (not the active selection).
  await deleteMedia(media.provider, media.key)
  await prisma.media.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
