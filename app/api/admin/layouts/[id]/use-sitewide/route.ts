import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'

type Ctx = { params: Promise<{ id: string }> }
type DisplayConditions = { include?: Array<{ type: string; value?: string }>; exclude?: Array<{ type: string; value?: string }> }

const ENTIRE_SITE_CONDITIONS = { include: [{ type: 'entire_site' }], exclude: [] }

// Publishes a starter template site-wide. Starters themselves stay read-only
// drafts (see duplicate/route.ts) — this creates or reactivates the template's
// editable `<id>-live` copy (the same convention lib/setup/starterLayouts.ts
// uses for fresh-install defaults), publishes it with an entire_site display
// condition, and strips that condition from whatever else of the same type
// was previously site-wide so only one layout wins per type.
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params
  try {
    const user = await getSessionFromCookie()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    const ok = await hasPermission(user, 'layouts.manage')
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const target = await prisma.layout.findUnique({ where: { id } })
    if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!target.isStarter) return NextResponse.json({ error: 'Only starter templates can be used site-wide this way.' }, { status: 400 })

    const liveId = `${id}-live`

    const others = await prisma.layout.findMany({ where: { type: target.type, status: 'published', NOT: { id: liveId } } })
    for (const other of others) {
      const conditions = (other.displayConditions as DisplayConditions) ?? {}
      const include = conditions.include ?? []
      if (include.some((r) => r.type === 'entire_site')) {
        await prisma.layout.update({
          where: { id: other.id },
          data: { displayConditions: { include: include.filter((r) => r.type !== 'entire_site'), exclude: conditions.exclude ?? [] } },
        })
      }
    }

    const existingLive = await prisma.layout.findUnique({ where: { id: liveId } })
    const live = existingLive
      ? await prisma.layout.update({ where: { id: liveId }, data: { status: 'published', displayConditions: ENTIRE_SITE_CONDITIONS } })
      : await prisma.layout.create({
          data: {
            id: liveId,
            name: target.name,
            description: target.description,
            type: target.type,
            builderData: target.builderData ?? undefined,
            status: 'published',
            displayConditions: ENTIRE_SITE_CONDITIONS,
            priority: target.priority,
            isStarter: false,
          },
        })

    return NextResponse.json(live)
  } catch {
    return NextResponse.json({ error: 'Failed to publish layout site-wide' }, { status: 500 })
  }
}
