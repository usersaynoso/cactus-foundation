import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { logMemberAdminAction } from '@/lib/members/admin-log'
import { sendMemberEmail } from '@/lib/email/templates'
import { isEmailConfigured } from '@/lib/config/env'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'members.approve'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const member = await prisma.member.update({
    where: { id, status: 'PENDING_APPROVAL' },
    data: { status: 'ACTIVE' },
  }).catch(() => null)
  if (!member) return NextResponse.json({ error: 'Member is not awaiting approval' }, { status: 400 })

  await logMemberAdminAction(user, id, 'approve')

  if (isEmailConfigured()) {
    const siteConfig = await prisma.siteConfig.findUnique({ where: { id: 'singleton' }, select: { siteName: true } })
    const siteName = siteConfig?.siteName ?? 'Cactus'
    await sendMemberEmail({ email: member.email }, 'member.approved', { siteName }).catch(() => {})
  }

  return NextResponse.json({ status: member.status })
}
