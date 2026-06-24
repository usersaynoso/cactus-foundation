import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { prisma } from '@/lib/db/prisma'
import { resolveMenu } from '@/lib/menu/resolve'
import { errorResponse } from '@/lib/utils'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'menus.manage')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const menu = await prisma.menu.findUnique({ where: { id }, select: { name: true } })
  if (!menu) return errorResponse('Not found', 404)

  const items = await resolveMenu(id)
  return NextResponse.json({ name: menu.name, items })
}
