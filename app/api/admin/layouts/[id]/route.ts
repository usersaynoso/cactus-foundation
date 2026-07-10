import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'

const HISTORY_CAP = 10

type HistoryEntry = {
  data: unknown
  title: string
  at: string
  byId: string | null
}

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params
  try {
    const user = await getSessionFromCookie()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const layout = await prisma.layout.findUnique({ where: { id } })
    if (!layout) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(layout)
  } catch {
    return NextResponse.json({ error: 'Failed to load layout' }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params
  try {
    const user = await getSessionFromCookie()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    const ok = await hasPermission(user, 'layouts.manage')
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const target = await prisma.layout.findUnique({ where: { id }, select: { isStarter: true } })
    if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (target.isStarter) return NextResponse.json({ error: 'Starter layouts are read-only. Duplicate the layout to edit it.' }, { status: 400 })

    const body = await req.json()

    // Validate displayConditions when publishing
    if (body.status === 'published') {
      const conditions = body.displayConditions
      if (!conditions?.include?.length) {
        // Check existing conditions if not being updated
        if (!('displayConditions' in body)) {
          const existing = await prisma.layout.findUnique({ where: { id }, select: { displayConditions: true } })
          const existingConds = existing?.displayConditions as { include?: unknown[] } | null
          if (!existingConds?.include?.length) {
            return NextResponse.json(
              { error: 'Add at least one display condition before publishing.' },
              { status: 400 },
            )
          }
        } else {
          return NextResponse.json(
            { error: 'Add at least one display condition before publishing.' },
            { status: 400 },
          )
        }
      }
    }

    const data: Record<string, unknown> = {}
    if ('name' in body) data.name = body.name
    if ('description' in body) data.description = body.description
    if ('builderData' in body) data.builderData = body.builderData
    if ('status' in body) data.status = body.status
    if ('type' in body) data.type = body.type
    if ('displayConditions' in body) data.displayConditions = body.displayConditions
    if ('priority' in body) data.priority = body.priority

    // On each publish: archive the previous live version into history (capped),
    // then set publishedData to the new content — mirrors InfoPage's publish route.
    if (body.status === 'published') {
      const existing = await prisma.layout.findUnique({
        where: { id },
        select: { name: true, publishedData: true, publishedAt: true, publishedById: true, history: true, updatedAt: true, builderData: true },
      })
      const existingHistory = Array.isArray(existing?.history) ? (existing.history as HistoryEntry[]) : []
      let newHistory = existingHistory

      if (existing?.publishedData !== null && existing?.publishedData !== undefined) {
        const archivedEntry: HistoryEntry = {
          data: existing.publishedData,
          title: existing.name,
          at: (existing.publishedAt ?? existing.updatedAt).toISOString(),
          byId: existing.publishedById ?? null,
        }
        newHistory = [archivedEntry, ...existingHistory].slice(0, HISTORY_CAP)
      }

      data.publishedData = 'builderData' in body ? body.builderData : existing?.builderData
      data.publishedAt = new Date()
      data.publishedById = user.id
      data.history = newHistory
    }

    const layout = await prisma.layout.update({ where: { id }, data })
    return NextResponse.json(layout)
  } catch {
    return NextResponse.json({ error: 'Failed to update layout' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params
  try {
    const user = await getSessionFromCookie()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    const ok = await hasPermission(user, 'layouts.manage')
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const layout = await prisma.layout.findUnique({ where: { id }, select: { isStarter: true } })
    if (!layout) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (layout.isStarter) return NextResponse.json({ error: 'Starter layouts cannot be deleted' }, { status: 400 })

    await prisma.layout.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete layout' }, { status: 500 })
  }
}
