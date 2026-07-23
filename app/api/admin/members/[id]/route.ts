import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { logMemberAdminAction } from '@/lib/members/admin-log'
import { isHttpUrl } from '@/lib/utils'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'members.view'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const member = await prisma.member.findUnique({
    where: { id },
    include: {
      passkeys: { select: { id: true, deviceName: true, createdAt: true, lastUsedAt: true } },
      password: { select: { id: true } },
      twoFactorConfigs: { select: { method: true, verified: true } },
      sessions: { where: { expiresAt: { gt: new Date() } }, select: { id: true, ipAddress: true, userAgent: true, lastActiveAt: true } },
      adminNotes: { orderBy: { createdAt: 'desc' } },
      consentRecords: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  })
  if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ member })
}

const Body = z.object({
  displayName: z.string().trim().max(80).nullable().optional(),
  bio: z.string().trim().max(500).nullable().optional(),
  // http(s) only - a "javascript:" value here renders into an href on the
  // member's public profile page (stored XSS), same as the member-facing path.
  websiteUrl: z.string().trim().max(300).refine(isHttpUrl, 'Enter a valid website address (http or https)').nullable().or(z.literal('')).optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'members.edit'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const updated = await prisma.member.update({ where: { id }, data: parsed.data })
  await logMemberAdminAction(user, id, 'edit_profile', parsed.data)

  return NextResponse.json({ member: updated })
}

// Admin hard delete - bypasses the member-initiated grace period entirely.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'members.delete'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const member = await prisma.member.findUnique({ where: { id }, select: { username: true } })
  if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // No MemberAdminActionLog entry for this one: the log table FKs Member with
  // onDelete Cascade (same schema, so the entity being audited and its own
  // audit trail are tied together) - a row written here would be deleted in
  // the very same statement as the member it describes. Flagged as a Phase 10
  // hardening item; fixing it needs a schema change (a protected-phase diff).
  await prisma.member.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
