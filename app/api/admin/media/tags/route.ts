import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'

function cleanTag(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, 40)
}

// GET — every tag with how many items carry it, for autocomplete and the filter.
export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  const tags = await prisma.tag.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, _count: { select: { media: true } } },
  })
  return NextResponse.json({ tags: tags.map((t) => ({ id: t.id, name: t.name, count: t._count.media })) })
}

// POST — create a tag (idempotent: returns the existing one if the name is taken).
export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'media.upload')) return errorResponse('Forbidden', 403)

  const body = await request.json().catch(() => null)
  const name = cleanTag(typeof body?.name === 'string' ? body.name : '')
  if (!name) return errorResponse('Tag name is required')

  const tag = await prisma.tag.upsert({
    where: { name },
    create: { name },
    update: {},
    select: { id: true, name: true },
  })
  return NextResponse.json({ ok: true, tag }, { status: 201 })
}
