import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'templates.manage')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const template = await prisma.pageTemplate.findUnique({ where: { id } })
  if (!template) return errorResponse('Not found', 404)

  const { data } = await request.json()
  await prisma.pageTemplate.update({ where: { id }, data: { builderData: data } })
  return NextResponse.json({ ok: true })
}
