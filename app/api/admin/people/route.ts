// Unified staff (User) + site member (Member) directory for admin > Users.
// The two are separate tables/auth systems (see CLAUDE.md) - this route joins
// them with a raw UNION ALL purely for a combined, searchable, paginated view.
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { parsePaginationParams } from '@/lib/utils'

type PersonRow = {
  id: string
  kind: 'staff' | 'member'
  username: string
  email: string
  displayName: string | null
  roleId: string | null
  roleName: string
  roleProtected: boolean
  status: string
  suspended: boolean
  createdAt: Date
}

const SORTABLE = ['createdAt', 'username'] as const
type SortField = (typeof SORTABLE)[number]

export async function GET(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'users.manage'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const canViewMembers = await hasPermission(user, 'members.list')

  const { searchParams } = request.nextUrl
  const { skip, perPage, page } = parsePaginationParams(Object.fromEntries(searchParams))
  const q = searchParams.get('q')?.trim()
  const typeParam = searchParams.get('type')
  const type = typeParam === 'staff' || (typeParam === 'member' && canViewMembers) ? typeParam : ''
  const sortParam = searchParams.get('sort')
  const sortField: SortField = SORTABLE.includes(sortParam as SortField) ? (sortParam as SortField) : 'createdAt'
  const sortDir = searchParams.get('dir') === 'asc' ? 'asc' : 'desc'

  const subqueries: Prisma.Sql[] = []
  if (type !== 'member') {
    subqueries.push(Prisma.sql`
      SELECT u.id, 'staff' AS kind, u.username, u.email, u."displayName",
        u."roleId" AS "roleId", r.name AS "roleName", r."isProtected" AS "roleProtected",
        CASE WHEN u."suspendedAt" IS NOT NULL THEN 'SUSPENDED' WHEN u."emailVerifiedAt" IS NULL THEN 'UNVERIFIED' ELSE 'ACTIVE' END AS status,
        (u."suspendedAt" IS NOT NULL) AS suspended,
        u."createdAt"
      FROM "User" u JOIN "Role" r ON r.id = u."roleId"
    `)
  }
  if (type !== 'staff' && canViewMembers) {
    subqueries.push(Prisma.sql`
      SELECT m.id, 'member' AS kind, m.username, m.email, m."displayName",
        m."roleId" AS "roleId", COALESCE(mr.name, 'Members') AS "roleName", COALESCE(mr."isProtected", true) AS "roleProtected",
        m.status::text AS status,
        (m.status = 'SUSPENDED') AS suspended,
        m."createdAt"
      FROM "Member" m LEFT JOIN "Role" mr ON mr.id = m."roleId"
    `)
  }

  if (subqueries.length === 0) {
    return NextResponse.json({ people: [], total: 0, page, perPage })
  }

  const unioned = Prisma.sql`(${Prisma.join(subqueries, ' UNION ALL ')})`
  const searchClause = q
    ? Prisma.sql`WHERE (t.username ILIKE ${'%' + q + '%'} OR t.email ILIKE ${'%' + q + '%'} OR t."displayName" ILIKE ${'%' + q + '%'})`
    : Prisma.empty
  const orderColumn = sortField === 'username' ? Prisma.sql`t.username` : Prisma.sql`t."createdAt"`
  const orderDir = sortDir === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`

  const [people, countResult] = await Promise.all([
    prisma.$queryRaw<PersonRow[]>(Prisma.sql`
      SELECT * FROM ${unioned} t
      ${searchClause}
      ORDER BY ${orderColumn} ${orderDir}
      LIMIT ${perPage} OFFSET ${skip}
    `),
    prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT COUNT(*) AS count FROM ${unioned} t
      ${searchClause}
    `),
  ])

  return NextResponse.json({
    people,
    total: Number(countResult[0]?.count ?? 0),
    page,
    perPage,
  })
}
