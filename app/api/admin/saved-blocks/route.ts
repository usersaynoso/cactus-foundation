import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'pages.read')) return errorResponse('Forbidden', 403)

  const blocks = await prisma.savedBlock.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json({ blocks })
}

export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'pages.write')) return errorResponse('Forbidden', 403)

  const body = await request.json()
  const name = typeof body.name === 'string' ? body.name.slice(0, 200) : ''
  const componentType = typeof body.componentType === 'string' ? body.componentType : ''
  if (!name || !componentType || !body.data) return errorResponse('name, componentType and data are required')

  const block = await prisma.savedBlock.create({
    data: { name, componentType, data: body.data },
  })
  return NextResponse.json(block)
}
