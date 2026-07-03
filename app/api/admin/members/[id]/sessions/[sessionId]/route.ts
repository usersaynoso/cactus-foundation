import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { logMemberAdminAction } from '@/lib/members/admin-log'

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; sessionId: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'members.edit'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id, sessionId } = await params
  await prisma.memberSession.deleteMany({ where: { id: sessionId, memberId: id } })
  await logMemberAdminAction(user, id, 'revoke_session', { sessionId })

  return NextResponse.json({ ok: true })
}
