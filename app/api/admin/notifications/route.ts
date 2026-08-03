import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
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
        actionLabel: true,
        readAt: true,
        deployInitiatedAt: true,
        createdAt: true,
        // A video-optimise job carries its state in the dedupeKey and its live
        // progress in reasons[0], which is what the bell draws its bar from.
        dedupeKey: true,
        reasons: true,
      },
    }),
    getUnreadCount(),
  ])

  return NextResponse.json({ notifications, unreadCount })
}

const PatchAllBody = z.object({
  read: z.boolean(),
})

// Bulk read-state change across the whole table, not just the slice the bell or
// the page happens to be showing - "mark all as read" that quietly left older
// items unread would be a lie the badge count immediately gives away.
export async function PATCH(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'config.manage')) return errorResponse('Forbidden', 403)

  const parsed = PatchAllBody.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input')

  const { read } = parsed.data

  const { count } = await prisma.notification.updateMany({
    where: read ? { readAt: null } : { readAt: { not: null } },
    data: { readAt: read ? new Date() : null },
  })

  return NextResponse.json({ ok: true, updated: count })
}

// The one notification that is not history: an "open" deployment notification
// carries the list of changes that are saved but not yet live, and is the only
// route to the Redeploy now button. Nothing re-creates it - recordDeploymentNeeded
// only writes when the NEXT change comes in - so deleting it would leave the site
// serving stale config with no trace that anything was pending.
const OPEN_DEPLOYMENT = { type: 'deployment', deployInitiatedAt: null } as const

// Clears the lot bar the above. Everything else is safely re-derivable: a
// video-optimise job still encoding writes itself back on the next progress tick
// and the update alerts are re-raised by the next update check (both upsert by
// dedupeKey), so this only loses history - which is the point of the button.
export async function DELETE() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'config.manage')) return errorResponse('Forbidden', 403)

  const [{ count: deleted }, kept] = await Promise.all([
    prisma.notification.deleteMany({ where: { NOT: OPEN_DEPLOYMENT } }),
    prisma.notification.count({ where: OPEN_DEPLOYMENT }),
  ])

  return NextResponse.json({ ok: true, deleted, kept })
}
