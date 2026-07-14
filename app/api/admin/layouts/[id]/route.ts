import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { isKnownLayoutType } from '@/lib/layout/layout-type-tabs'
import { isCompleteRule, type ConditionRule, type DisplayConditions } from '@/lib/layout/displayConditions'

const HISTORY_CAP = 10

const STATUSES = new Set(['draft', 'published'])

type HistoryEntry = {
  data: unknown
  title: string
  at: string
  byId: string | null
}

type Ctx = { params: Promise<{ id: string }> }

/** A layout can only go live on a rule that is actually finished. An include
 * list of one half-filled rule ("specific page", no page picked) is a layout
 * that renders nowhere - or, before matchesRule learned to say no, everywhere. */
function hasUsableIncludeRule(conditions: unknown): boolean {
  const include = (conditions as DisplayConditions | null)?.include
  if (!Array.isArray(include) || include.length === 0) return false
  return include.some((rule) => rule && typeof rule === 'object' && isCompleteRule(rule as ConditionRule))
}

const NO_CONDITIONS_ERROR = 'Add at least one complete display condition before publishing.'

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params
  try {
    const user = await getSessionFromCookie()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    const ok = await hasPermission(user, 'layouts.manage')
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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

    const target = await prisma.layout.findUnique({ where: { id }, select: { id: true } })
    if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json()

    // Everything the Settings tab autosaves lands here. Unchecked, an empty name
    // field saved a nameless layout, and a status or type outside the enum went
    // to Prisma raw and came back as a 500 with nothing useful in it.
    const data: Record<string, unknown> = {}

    if ('name' in body) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        return NextResponse.json({ error: 'Name required' }, { status: 400 })
      }
      data.name = body.name.trim()
    }
    if ('description' in body) {
      if (body.description !== null && typeof body.description !== 'string') {
        return NextResponse.json({ error: 'Invalid description' }, { status: 400 })
      }
      data.description = typeof body.description === 'string' ? body.description.trim() || null : null
    }
    if ('status' in body) {
      if (!STATUSES.has(body.status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      data.status = body.status
    }
    if ('type' in body) {
      if (!isKnownLayoutType(body.type)) return NextResponse.json({ error: 'Unknown layout type' }, { status: 400 })
      data.type = body.type
    }
    if ('priority' in body) {
      const priority = Number(body.priority)
      if (!Number.isInteger(priority)) return NextResponse.json({ error: 'Priority must be a whole number' }, { status: 400 })
      data.priority = priority
    }
    if ('displayConditions' in body) {
      const conditions = body.displayConditions
      const shaped = conditions === null || (
        typeof conditions === 'object'
        && Array.isArray((conditions as DisplayConditions).include)
        && Array.isArray((conditions as DisplayConditions).exclude)
      )
      if (!shaped) return NextResponse.json({ error: 'Invalid display conditions' }, { status: 400 })
      data.displayConditions = conditions
    }
    if ('builderData' in body) data.builderData = body.builderData

    // Publishing needs somewhere to publish to: a layout with no usable include
    // rule renders on no page at all, so going live is a no-op with a green tick
    // on it. Check whatever this request leaves the layout with - the conditions
    // in the body if it carries them, otherwise the ones already stored.
    if (body.status === 'published') {
      const conditions = 'displayConditions' in body
        ? body.displayConditions
        : (await prisma.layout.findUnique({ where: { id }, select: { displayConditions: true } }))?.displayConditions
      if (!hasUsableIncludeRule(conditions)) {
        return NextResponse.json({ error: NO_CONDITIONS_ERROR }, { status: 400 })
      }
    }

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

    const layout = await prisma.layout.findUnique({ where: { id }, select: { id: true } })
    if (!layout) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await prisma.layout.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete layout' }, { status: 500 })
  }
}
