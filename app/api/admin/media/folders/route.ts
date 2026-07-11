import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { createFolder } from '@/lib/media/organise'

// GET — every folder (flat), each with a direct-child media count, for the
// library's folder tree. The client assembles the tree from parentId.
export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  const [folders, counts] = await Promise.all([
    prisma.folder.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, parentId: true } }),
    prisma.media.groupBy({ by: ['folderId'], _count: { _all: true } }),
  ])

  const countByFolder = new Map<string, number>()
  let rootCount = 0
  for (const c of counts) {
    if (c.folderId) countByFolder.set(c.folderId, c._count._all)
    else rootCount = c._count._all
  }

  return NextResponse.json({
    folders: folders.map((f) => ({ ...f, mediaCount: countByFolder.get(f.id) ?? 0 })),
    rootCount,
  })
}

// POST — create a folder. Body: { name, parentId? }.
export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'media.upload')) return errorResponse('Forbidden', 403)

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name : ''
  const parentId = typeof body?.parentId === 'string' ? body.parentId : null

  try {
    const folder = await createFolder(name, parentId)
    return NextResponse.json({ ok: true, folder }, { status: 201 })
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Could not create folder', 400)
  }
}
