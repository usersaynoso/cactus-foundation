import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { logMemberAdminAction } from '@/lib/members/admin-log'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'members.suspend'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  // Only a suspended member can be unsuspended. Without the status filter this
  // flipped ANY member to ACTIVE - a registration still awaiting approval or
  // email verification walked straight past both, and one already deleted came
  // back to life.
  const member = await prisma.member.update({
    where: { id, status: 'SUSPENDED' },
    data: { status: 'ACTIVE', suspensionReason: null, suspendedUntil: null, suspensionNotified: false },
  }).catch(() => null)
  if (!member) return NextResponse.json({ error: 'Member is not suspended' }, { status: 400 })

  await logMemberAdminAction(user, id, 'unsuspend')

  return NextResponse.json({ status: member.status })
}
