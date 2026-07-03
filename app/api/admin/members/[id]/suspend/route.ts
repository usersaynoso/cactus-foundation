import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { logMemberAdminAction } from '@/lib/members/admin-log'
import { sendMemberEmail } from '@/lib/email/templates'
import { isEmailConfigured } from '@/lib/config/env'

const Body = z.object({
  reason: z.string().trim().max(500).optional(),
  until: z.string().datetime().optional(),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'members.suspend'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const parsed = Body.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const member = await prisma.member.update({
    where: { id },
    data: {
      status: 'SUSPENDED',
      suspensionReason: parsed.data.reason ?? null,
      suspendedUntil: parsed.data.until ? new Date(parsed.data.until) : null,
      suspensionNotified: false,
    },
  })

  // Suspension invalidates any live sessions immediately.
  await prisma.memberSession.deleteMany({ where: { memberId: id } })

  await logMemberAdminAction(user, id, 'suspend', { reason: parsed.data.reason, until: parsed.data.until })

  if (isEmailConfigured()) {
    const siteConfig = await prisma.siteConfig.findUnique({ where: { id: 'singleton' }, select: { siteName: true } })
    const reasonLine = parsed.data.reason ? ` Reason given: ${parsed.data.reason}` : ''
    await sendMemberEmail(
      { email: member.email },
      'member.suspended',
      { siteName: siteConfig?.siteName ?? 'Cactus', reasonLine }
    ).catch(() => {})
    await prisma.member.update({ where: { id }, data: { suspensionNotified: true } })
  }

  return NextResponse.json({ status: member.status })
}
