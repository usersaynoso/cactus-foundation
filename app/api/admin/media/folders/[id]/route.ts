import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { renameFolder, moveFolder, deleteFolderCascade, summariseFolderDeletion } from '@/lib/media/organise'

type Ctx = { params: Promise<{ id: string }> }

// GET — a summary of what a cascade delete would remove (folder + media counts
// and the names of any in-use files), so the confirm dialog can warn precisely.
export async function GET(_request: NextRequest, { params }: Ctx) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  const { id } = await params
  try {
    const summary = await summariseFolderDeletion(id)
    return NextResponse.json(summary)
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Folder not found', 404)
  }
}

// PATCH — rename or move a folder. Body carrying `parentId` (string or null)
// moves the folder under that parent; body carrying `name` renames it. Either
// way every descendant item is relocated so its serving url reflects the change.
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'media.upload')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const body = await request.json().catch(() => null)

  if (body && Object.prototype.hasOwnProperty.call(body, 'parentId')) {
    const parentId = typeof body.parentId === 'string' ? body.parentId : null
    try {
      await moveFolder(id, parentId)
      return NextResponse.json({ ok: true })
    } catch (err: unknown) {
      return errorResponse(err instanceof Error ? err.message : 'Move failed', 400)
    }
  }

  const name = typeof body?.name === 'string' ? body.name : ''
  if (!name.trim()) return errorResponse('Folder name is required')

  try {
    await renameFolder(id, name)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Rename failed', 400)
  }
}

// DELETE — permanently remove the folder, its subfolders, and every file inside
// (blobs and all). The destructive cascade the admin explicitly confirms.
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'media.delete')) return errorResponse('Forbidden', 403)

  const { id } = await params
  try {
    const result = await deleteFolderCascade(id)
    return NextResponse.json({ ok: true, ...result })
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Delete failed', 500)
  }
}
