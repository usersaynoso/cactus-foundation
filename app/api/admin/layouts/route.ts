import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'

export async function GET() {
  try {
    const layouts = await prisma.layout.findMany({ orderBy: [{ isStarter: 'desc' }, { createdAt: 'asc' }] })
    const [siteConfig, moduleDefaults] = await Promise.all([
      prisma.siteConfig.findUnique({ where: { id: 'singleton' }, select: { defaultLayoutId: true } }),
      prisma.moduleLayoutDefault.findMany({ include: { layout: { select: { id: true, name: true } } } }),
    ])
    return NextResponse.json({ layouts, defaultLayoutId: siteConfig?.defaultLayoutId, moduleDefaults })
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

    const { name, description, builderData } = await req.json()
    if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

    const layout = await prisma.layout.create({ data: { name: name.trim(), description: description?.trim() ?? null, builderData: builderData ?? null } })
    return NextResponse.json(layout, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create layout' }, { status: 500 })
  }
}
