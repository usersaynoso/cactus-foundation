import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { parsePaginationParams } from '@/lib/utils'
import type { Prisma, MemberStatus } from '@prisma/client'

const SORTABLE = ['createdAt', 'username', 'status'] as const
type SortField = (typeof SORTABLE)[number]

export async function GET(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'members.list'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = request.nextUrl
  const { skip, perPage, page } = parsePaginationParams(Object.fromEntries(searchParams))
  const q = searchParams.get('q')?.trim()
  const status = searchParams.get('status') as MemberStatus | null
  const trusted = searchParams.get('trusted')
  const sortParam = searchParams.get('sort')
  const sortField: SortField = SORTABLE.includes(sortParam as SortField) ? (sortParam as SortField) : 'createdAt'
  const sortDir = searchParams.get('dir') === 'asc' ? 'asc' : 'desc'

  const where: Prisma.MemberWhereInput = {
    ...(q ? { OR: [{ username: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { displayName: { contains: q, mode: 'insensitive' } }] } : {}),
    ...(status ? { status } : {}),
    ...(trusted === 'true' ? { trusted: true } : trusted === 'false' ? { trusted: false } : {}),
  }

  const [members, total] = await Promise.all([
    prisma.member.findMany({
      where,
      skip,
      take: perPage,
      orderBy: { [sortField]: sortDir },
      select: {
        id: true, email: true, username: true, displayName: true, status: true,
        trusted: true, avatarChoice: true, createdAt: true, suspendedUntil: true,
        deletionScheduledAt: true,
      },
    }),
    prisma.member.count({ where }),
  ])

  return NextResponse.json({ members, total, page, perPage })
}
