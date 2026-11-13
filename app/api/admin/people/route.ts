// Admin › Users list: staff and members in one view. The SQL lives in
// lib/members/people-directory.ts; this route only checks who is asking and
// what they may see.
//
// ?format=csv returns the whole filtered list (up to PEOPLE_EXPORT_LIMIT rows)
// as a spreadsheet instead of a page of JSON - "everyone who said yes to
// marketing" is a list somebody will want to take elsewhere.
import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermissions } from '@/lib/permissions/check'
import { parsePaginationParams } from '@/lib/utils'
import { peopleCustomerProviders } from '@/lib/members/people-customer-providers'
import { PeopleQuerySchema, exportPeople, listPeople, peopleCsv } from '@/lib/members/people-directory'

export async function GET(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const granted = await hasPermissions(user, ['users.manage', 'members.list'])
  if (!granted['users.manage']) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const canViewMembers = granted['members.list'] === true

  const raw = Object.fromEntries(request.nextUrl.searchParams)
  const { skip, perPage, page } = parsePaginationParams(raw)
  const query = PeopleQuerySchema.parse(raw)
  const providers = canViewMembers ? await peopleCustomerProviders(user) : []

  if (query.format === 'csv') {
    const { rows, customersEnabled } = await exportPeople({ query, canViewMembers, providers })
    return new Response(peopleCsv(rows, customersEnabled), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="people-${new Date().toISOString().slice(0, 10)}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  const result = await listPeople({ query, canViewMembers, providers, skip, perPage })
  return NextResponse.json({ ...result, page, perPage })
}
