import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'menus.manage')) return errorResponse('Forbidden', 403)

  const menus = await prisma.menu.findMany({
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { items: true } } },
  })

  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { mainMenuId: true },
  })

  return NextResponse.json({
    menus: menus.map((m) => ({
      id: m.id,
      name: m.name,
      itemCount: m._count.items,
      isMainMenu: m.id === config?.mainMenuId,
      createdAt: m.createdAt,
    })),
  })
}

const CreateBody = z.object({
  name: z.string().min(1).max(100),
})

export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'menus.manage')) return errorResponse('Forbidden', 403)

  const parsed = CreateBody.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input')

  const menu = await prisma.menu.create({ data: { name: parsed.data.name } })
  return NextResponse.json(menu, { status: 201 })
}
