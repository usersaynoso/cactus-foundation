import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'

export async function GET() {
  try {
    const config = await prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { headerBuilderData: true, footerBuilderData: true, designTokens: true },
    })
    return NextResponse.json(config ?? {})
  } catch {
    return NextResponse.json({ error: 'Failed to load appearance' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getSessionFromCookie()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    const ok = await hasPermission(user, 'appearance.manage')
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const allowed = ['headerBuilderData', 'footerBuilderData', 'designTokens'] as const
    const data: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) data[key] = body[key]
    }

    const config = await prisma.siteConfig.update({ where: { id: 'singleton' }, data })
    return NextResponse.json(config)
  } catch {
    return NextResponse.json({ error: 'Failed to save appearance' }, { status: 500 })
  }
}
