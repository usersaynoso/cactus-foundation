import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { getUnreadCount } from '@/lib/notifications/deployment'

// The notification bell polls this route from every open admin tab and renders
// the five most recent items, so it reads a small, explicit slice - not the whole
// table on every poll.
const BELL_LIMIT = 20

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'config.manage')) return errorResponse('Forbidden', 403)

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      orderBy: { createdAt: 'desc' },
      take: BELL_LIMIT,
      select: {
        id: true,
        title: true,
        type: true,
        link: true,
        readAt: true,
        deployInitiatedAt: true,
        createdAt: true,
      },
    }),
    getUnreadCount(),
  ])

  return NextResponse.json({ notifications, unreadCount })
}
