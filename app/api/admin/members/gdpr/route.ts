import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'members.gdpr'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [consentRecords, exportRequests, deletionRequests, processingLog] = await Promise.all([
    prisma.memberConsentRecord.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { member: { select: { username: true } } },
    }),
    prisma.memberDataExportRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { member: { select: { username: true } } },
    }),
    prisma.member.findMany({
      where: { deletionRequestedAt: { not: null } },
      orderBy: { deletionScheduledAt: 'asc' },
      select: { id: true, username: true, deletionRequestedAt: true, deletionScheduledAt: true },
    }),
    prisma.memberAdminActionLog.findMany({
      where: { action: { in: ['export_trigger', 'reset_password', 'suspend', 'unsuspend'] } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { member: { select: { username: true } } },
    }),
  ])

  return NextResponse.json({ consentRecords, exportRequests, deletionRequests, processingLog })
}
