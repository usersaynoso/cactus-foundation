import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'

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
  const result = await prisma.member.deleteMany({ where: { id, status: 'PENDING_APPROVAL' } })
  if (result.count === 0) {
    return NextResponse.json({ error: 'Member is not awaiting approval' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
