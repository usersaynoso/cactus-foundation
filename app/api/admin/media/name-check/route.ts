import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { checkUploadName } from '@/lib/media/organise'

// Which of the names about to be uploaded are already taken in the destination
// folder, and what each could be called instead.
//
// Asked before a byte moves, so the person uploading is offered Replace / Keep
// both / Skip rather than finding out afterwards that the library silently filed
// their file under a name they didn't choose.
export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'media.upload')) return errorResponse('Forbidden', 403)

  const body = await request.json().catch(() => null)
  const rawFolderId = body?.folderId
  const folderId = typeof rawFolderId === 'string' && rawFolderId ? rawFolderId : null
  const names: string[] = Array.isArray(body?.names)
    ? body.names.filter((n: unknown): n is string => typeof n === 'string' && !!n)
    : []
  if (names.length === 0) return NextResponse.json({ clashes: [] })

  // Deduplicated: a batch containing the same name twice only needs asking once,
  // and the second copy is a clash against the first either way.
  const clashes: { name: string; existingId: string; suggestedName: string }[] = []
  for (const name of Array.from(new Set(names))) {
    const clash = await checkUploadName(name, folderId)
    if (clash) clashes.push({ name, ...clash })
  }

  return NextResponse.json({ clashes })
}
