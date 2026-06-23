import { NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermissions } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  const perms = await hasPermissions(user, [
    'pages.read', 'pages.write', 'pages.publish', 'pages.delete',
  ])

  return NextResponse.json({
    canRead:    perms['pages.read']    ?? false,
    canWrite:   perms['pages.write']   ?? false,
    canPublish: perms['pages.publish'] ?? false,
    canDelete:  perms['pages.delete']  ?? false,
  })
}
