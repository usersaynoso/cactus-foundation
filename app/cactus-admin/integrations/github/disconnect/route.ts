import { NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { prisma } from '@/lib/db/prisma'
import { errorResponse } from '@/lib/utils'

export async function POST() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'config.manage')) return errorResponse('Forbidden', 403)

  await prisma.githubAppConnection.deleteMany()

  return NextResponse.json({
    ok: true,
    note: 'The GitHub App and its installation still exist on GitHub. Visit github.com/settings/apps to remove them.',
  })
}
