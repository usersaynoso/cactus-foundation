import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'members.notes'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const notes = await prisma.memberAdminNote.findMany({
    where: { memberId: id },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ notes })
}

const Body = z.object({ body: z.string().trim().min(1).max(2000) })

// Append-only: no PATCH/DELETE exists for these rows on purpose.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'members.notes'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const note = await prisma.memberAdminNote.create({
    data: {
      memberId: id,
      authorId: user.id,
      authorName: user.displayName || user.username,
      body: parsed.data.body,
    },
  })

  return NextResponse.json({ note })
}
