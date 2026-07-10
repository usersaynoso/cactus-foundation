import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params
  try {
    const user = await getSessionFromCookie()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    const ok = await hasPermission(user, 'layouts.manage')
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const target = await prisma.layout.findUnique({ where: { id }, select: { isStarter: true } })
    if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (target.isStarter) return NextResponse.json({ error: 'Starter layouts are read-only. Duplicate the layout to edit it.' }, { status: 400 })

    const layout = await prisma.layout.update({ where: { id }, data: { status: 'published' } })
    return NextResponse.json(layout)
  } catch {
    return NextResponse.json({ error: 'Failed to publish layout' }, { status: 500 })
  }
}
