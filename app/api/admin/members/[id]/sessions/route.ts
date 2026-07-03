import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { logMemberAdminAction } from '@/lib/members/admin-log'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'members.view'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const sessions = await prisma.memberSession.findMany({
    where: { memberId: id, expiresAt: { gt: new Date() } },
    orderBy: { lastActiveAt: 'desc' },
    select: { id: true, ipAddress: true, userAgent: true, lastActiveAt: true, createdAt: true },
  })
  return NextResponse.json({ sessions })
}

// Revoke every session for this member.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'members.edit'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  await prisma.memberSession.deleteMany({ where: { memberId: id } })
  await logMemberAdminAction(user, id, 'revoke_all_sessions')

  return NextResponse.json({ ok: true })
}
