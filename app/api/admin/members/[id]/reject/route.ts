import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { notifyMembersDeleting } from '@/lib/members/member-deleted'

// Rejecting a pending-approval registration removes it outright - it never
// became a real active member, so there's nothing to keep around the way a
// suspension or admin-delete of an active member would need explaining.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'members.approve'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const where = { id, status: 'PENDING_APPROVAL' as const }
  await notifyMembersDeleting(where)
  const result = await prisma.member.deleteMany({ where })
  if (result.count === 0) {
    return NextResponse.json({ error: 'Member is not awaiting approval' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
