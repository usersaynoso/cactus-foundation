import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'members.list'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [total, active, pendingApproval, pendingVerification, suspended, pendingDeletion, recentSuspensions] = await Promise.all([
    prisma.member.count(),
    prisma.member.count({ where: { status: 'ACTIVE' } }),
    prisma.member.count({ where: { status: 'PENDING_APPROVAL' } }),
    prisma.member.count({ where: { status: 'PENDING_VERIFICATION' } }),
    prisma.member.count({ where: { status: 'SUSPENDED' } }),
    prisma.member.count({ where: { deletionScheduledAt: { not: null } } }),
    prisma.member.findMany({
      where: { status: 'SUSPENDED' },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { id: true, username: true, suspensionReason: true, suspendedUntil: true },
    }),
  ])

  return NextResponse.json({
    total,
    active,
    pendingApproval,
    pendingVerification,
    suspended,
    pendingDeletion,
    recentSuspensions,
  })
}
