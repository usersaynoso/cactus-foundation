import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'

export async function GET(req: Request) {
  try {
    const user = await getSessionFromCookie()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type')
    const layouts = await prisma.layout.findMany({
      where: type ? { type } : undefined,
      orderBy: [{ isStarter: 'desc' }, { createdAt: 'asc' }],
    })
    return NextResponse.json({ layouts })
  } catch {
    return NextResponse.json({ error: 'Failed to load layouts' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionFromCookie()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    const ok = await hasPermission(user, 'layouts.manage')
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { name, description, type, builderData, displayConditions } = await req.json()
    if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

    const layout = await prisma.layout.create({
      data: {
        name: name.trim(),
        description: description?.trim() ?? null,
        type: type ?? 'infoPage',
        builderData: builderData ?? null,
        displayConditions: displayConditions ?? null,
      },
    })
    return NextResponse.json(layout, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create layout' }, { status: 500 })
  }
}
