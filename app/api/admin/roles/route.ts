import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'

const Body = z.object({
  name: z.string().min(1).max(50),
})

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'roles.manage')) return errorResponse('Forbidden', 403)

  const roles = await prisma.role.findMany({
    include: { permissions: { select: { permissionKey: true } } },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(roles)
}

export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'roles.manage')) return errorResponse('Forbidden', 403)

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input')

  const existing = await prisma.role.findUnique({ where: { name: parsed.data.name } })
  if (existing) return errorResponse(`Role "${parsed.data.name}" already exists`, 409)

  const role = await prisma.role.create({ data: { name: parsed.data.name, isProtected: false } })
  return NextResponse.json(role, { status: 201 })
}
