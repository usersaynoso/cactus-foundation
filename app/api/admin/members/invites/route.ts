import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { randomBytes, createHash } from 'crypto'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { getMemberAreaPath } from '@/lib/members/paths'

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

const Body = z.object({ expiresInDays: z.number().int().min(1).max(365).default(7) })

export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'members.invite'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = Body.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const token = randomBytes(32).toString('hex')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)

  await prisma.memberInvite.create({
    data: {
      tokenHash,
      createdById: user.id,
      createdByName: user.displayName || user.username,
      expiresAt,
    },
  })

  const siteUrl = process.env.SITE_URL?.replace(/\/$/, '') ?? ''
  const inviteUrl = `${siteUrl}/${getMemberAreaPath()}/register?invite=${token}`

  return NextResponse.json({ inviteUrl, expiresAt })
}
