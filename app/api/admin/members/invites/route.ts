import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { createMemberInvite, DEFAULT_INVITE_EXPIRY_DAYS, MAX_INVITE_EXPIRY_DAYS } from '@/lib/members/invites'

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'members.invite'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const invites = await prisma.memberInvite.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, createdByName: true, usedAt: true, usedByMemberId: true,
      revokedAt: true, createdAt: true, expiresAt: true,
    },
  })
  return NextResponse.json({ invites })
}

const Body = z.object({
  expiresInDays: z.number().int().min(1).max(MAX_INVITE_EXPIRY_DAYS).default(DEFAULT_INVITE_EXPIRY_DAYS),
})

export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'members.invite'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = Body.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  // The minting itself is shared with modules (lib/members/invites.ts); the
  // permission check above is this route's own and stays here.
  const { inviteUrl, expiresAt } = await createMemberInvite({
    createdById: user.id,
    createdByName: user.displayName || user.username,
    expiresInDays: parsed.data.expiresInDays,
  })

  return NextResponse.json({ inviteUrl, expiresAt })
}
