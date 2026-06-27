import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params
  try {
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
