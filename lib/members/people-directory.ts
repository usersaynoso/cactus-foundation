import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { summariseCustomers, type PeopleCustomerProvider, type PeopleCustomerSummary } from '@/lib/members/people-customers'

// Unified staff (User) + site member (Member) directory for Admin › Users.
// The two are separate tables and separate sign-in systems; this joins them
// with a raw UNION ALL purely for one combined, searchable, paginated view.
//
// Filters: who (staff/member), account status, and - when a module that sells
// things is installed and the viewer may see its customers - whether the member
// is a customer and what they said about marketing emails. Customer-ness comes
// from the core.people-customers extension point (./people-customers.ts) as
// SQL, so filtering, counting and paging all stay in the database.
//
// Kept apart from the route so the SQL can be run on its own against a real
// database: none of it is checked by the type checker, the linter or a build.

export type PersonRow = {
  id: string
  kind: 'staff' | 'member'
  username: string
  email: string
  displayName: string | null
  // Member rows only: who the account is made out to, and the organisation
  // they buy for - from the account page or carried in from an order.
  fullName: string | null
  organisation: string | null
  roleId: string | null
  roleName: string
  roleProtected: boolean
  status: string
  suspended: boolean
  // Member rows only: this account belongs to a staff sign-in, so the same
  // person is in this list twice by design rather than by accident.
  linkedToStaff: boolean
  emailVerified: boolean
  marketingConsent: boolean | null
  isCustomer: boolean
  createdAt: Date
}

export type PeopleFacets = {
  total: number
  staff: number
  members: number
  customers: number | null
  marketingYes: number | null
  marketingNo: number | null
  pending: number
}

export const PeopleQuerySchema = z.object({
  q: z.string().trim().max(200).optional().catch(undefined),
  type: z.enum(['staff', 'member']).optional().catch(undefined),
  status: z.enum(['ACTIVE', 'UNVERIFIED', 'PENDING_VERIFICATION', 'PENDING_APPROVAL', 'SUSPENDED']).optional().catch(undefined),
  customer: z.enum(['yes', 'no']).optional().catch(undefined),
  marketing: z.enum(['yes', 'no', 'unknown']).optional().catch(undefined),
  sort: z.enum(['createdAt', 'username', 'email']).optional().catch(undefined),
  dir: z.enum(['asc', 'desc']).optional().catch(undefined),
  format: z.enum(['json', 'csv']).optional().catch(undefined),
})
export type PeopleQuery = z.infer<typeof PeopleQuerySchema>

type FacetRow = { total: bigint; staff: bigint; members: bigint; customers: bigint; marketing_yes: bigint; marketing_no: bigint; pending: bigint }

type Built = { filtered: Prisma.Sql | null; everyone: Prisma.Sql; where: Prisma.Sql; searchOnly: Prisma.Sql; order: Prisma.Sql; customersEnabled: boolean }

function build(query: PeopleQuery, canViewMembers: boolean, providers: PeopleCustomerProvider[]): Built {
  const customersEnabled = canViewMembers && providers.length > 0
  // Customer and marketing filters only mean anything for members, and only
  // exist at all when a provider is there to answer them.
  const customer = customersEnabled ? query.customer : undefined
  const marketing = customersEnabled ? query.marketing : undefined
  const type = customer !== undefined || marketing !== undefined
    ? 'member'
    : query.type === 'member' && !canViewMembers ? undefined : query.type

  const isCustomerExpr = customersEnabled
    ? Prisma.sql`(${Prisma.join(providers.map((p) => p.isCustomerSql({ memberId: Prisma.sql`m.id`, email: Prisma.sql`m.email` })), ' OR ')})`
    : Prisma.sql`false`

  const staffSql = Prisma.sql`
    SELECT u.id, 'staff' AS kind, u.username, u.email, u."displayName",
      NULL::text AS "fullName", NULL::text AS organisation,
      u."roleId" AS "roleId", r.name AS "roleName", r."isProtected" AS "roleProtected",
      CASE WHEN u."suspendedAt" IS NOT NULL THEN 'SUSPENDED' WHEN u."emailVerifiedAt" IS NULL THEN 'UNVERIFIED' ELSE 'ACTIVE' END AS status,
      (u."suspendedAt" IS NOT NULL) AS suspended,
      false AS "linkedToStaff",
      (u."emailVerifiedAt" IS NOT NULL) AS "emailVerified",
      NULL::boolean AS "marketingConsent",
      false AS "isCustomer",
      u."createdAt"
    FROM "User" u JOIN "Role" r ON r.id = u."roleId"
  `
  const memberSql = Prisma.sql`
    SELECT m.id, 'member' AS kind, m.username, m.email, m."displayName",
      m."fullName" AS "fullName", m.organisation AS organisation,
      m."roleId" AS "roleId", COALESCE(mr.name, 'Members') AS "roleName", COALESCE(mr."isProtected", true) AS "roleProtected",
      m.status::text AS status,
      (m.status = 'SUSPENDED') AS suspended,
      (m."userId" IS NOT NULL) AS "linkedToStaff",
      m."emailVerified" AS "emailVerified",
      m."marketingConsent" AS "marketingConsent",
      ${isCustomerExpr} AS "isCustomer",
      m."createdAt"
    FROM "Member" m LEFT JOIN "Role" mr ON mr.id = m."roleId"
  `

  const everyoneParts = [staffSql, ...(canViewMembers ? [memberSql] : [])]
  const filteredParts = [
    ...(type !== 'member' ? [staffSql] : []),
    ...(type !== 'staff' && canViewMembers ? [memberSql] : []),
  ]

  const conditions: Prisma.Sql[] = []
  if (query.q) {
    const like = `%${query.q}%`
    conditions.push(Prisma.sql`(t.username ILIKE ${like} OR t.email ILIKE ${like} OR t."displayName" ILIKE ${like} OR t."fullName" ILIKE ${like} OR t.organisation ILIKE ${like})`)
  }
  const searchOnly = conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty
  if (query.status) conditions.push(Prisma.sql`t.status = ${query.status}`)
  if (customer) conditions.push(customer === 'yes' ? Prisma.sql`t."isCustomer"` : Prisma.sql`NOT t."isCustomer"`)
  if (marketing) {
    conditions.push(
      marketing === 'yes' ? Prisma.sql`t."marketingConsent" IS TRUE`
      : marketing === 'no' ? Prisma.sql`t."marketingConsent" IS FALSE`
      : Prisma.sql`t."marketingConsent" IS NULL`,
    )
  }
  const where = conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty

  const sortField = query.sort ?? 'createdAt'
  const orderColumn = sortField === 'username' ? Prisma.sql`LOWER(t.username)` : sortField === 'email' ? Prisma.sql`LOWER(t.email)` : Prisma.sql`t."createdAt"`
  const orderDir = (query.dir ?? (sortField === 'createdAt' ? 'desc' : 'asc')) === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`
  // id as a tie-break, so two people who joined in the same instant cannot
  // swap places between pages and turn up on both.
  const order = Prisma.sql`ORDER BY ${orderColumn} ${orderDir}, t.id ${orderDir}`

  return {
    filtered: filteredParts.length > 0 ? Prisma.sql`(${Prisma.join(filteredParts, ' UNION ALL ')})` : null,
    everyone: Prisma.sql`(${Prisma.join(everyoneParts, ' UNION ALL ')})`,
    where,
    searchOnly,
    order,
    customersEnabled,
  }
}

export type PeoplePage = {
  people: Array<PersonRow & { customerSummary: PeopleCustomerSummary | null }>
  total: number
  customersEnabled: boolean
  facets: PeopleFacets | null
}

export async function listPeople(opts: {
  query: PeopleQuery
  canViewMembers: boolean
  providers: PeopleCustomerProvider[]
  skip: number
  perPage: number
}): Promise<PeoplePage> {
  const b = build(opts.query, opts.canViewMembers, opts.providers)
  if (!b.filtered) return { people: [], total: 0, customersEnabled: b.customersEnabled, facets: null }

  // The facet counts ignore every filter but the search box, so the numbers on
  // the chips say how many each chip WOULD show, not how many are on screen.
  const [people, countResult, facetRows] = await Promise.all([
    prisma.$queryRaw<PersonRow[]>(Prisma.sql`SELECT * FROM ${b.filtered} t ${b.where} ${b.order} LIMIT ${opts.perPage} OFFSET ${opts.skip}`),
    prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS count FROM ${b.filtered} t ${b.where}`),
    prisma.$queryRaw<FacetRow[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE t.kind = 'staff')::bigint AS staff,
        COUNT(*) FILTER (WHERE t.kind = 'member')::bigint AS members,
        COUNT(*) FILTER (WHERE t."isCustomer")::bigint AS customers,
        COUNT(*) FILTER (WHERE t."marketingConsent" IS TRUE)::bigint AS marketing_yes,
        COUNT(*) FILTER (WHERE t."marketingConsent" IS FALSE)::bigint AS marketing_no,
        COUNT(*) FILTER (WHERE t.status = 'PENDING_APPROVAL')::bigint AS pending
      FROM ${b.everyone} t ${b.searchOnly}
    `),
  ])

  const customers = people.filter((p) => p.kind === 'member' && p.isCustomer).map((p) => ({ memberId: p.id, email: p.email }))
  const summaries = b.customersEnabled ? await summariseCustomers(opts.providers, customers) : {}
  const f = facetRows[0]

  return {
    people: people.map((p) => ({ ...p, customerSummary: p.kind === 'member' ? summaries[p.id] ?? null : null })),
    total: Number(countResult[0]?.count ?? 0),
    customersEnabled: b.customersEnabled,
    facets: f
      ? {
          total: Number(f.total),
          staff: Number(f.staff),
          members: Number(f.members),
          customers: b.customersEnabled ? Number(f.customers) : null,
          marketingYes: b.customersEnabled ? Number(f.marketing_yes) : null,
          marketingNo: b.customersEnabled ? Number(f.marketing_no) : null,
          pending: Number(f.pending),
        }
      : null,
  }
}

export const PEOPLE_EXPORT_LIMIT = 10_000

/** The whole filtered list, for the spreadsheet download. */
export async function exportPeople(opts: { query: PeopleQuery; canViewMembers: boolean; providers: PeopleCustomerProvider[] }): Promise<{ rows: PersonRow[]; customersEnabled: boolean }> {
  const b = build(opts.query, opts.canViewMembers, opts.providers)
  if (!b.filtered) return { rows: [], customersEnabled: b.customersEnabled }
  const rows = await prisma.$queryRaw<PersonRow[]>(Prisma.sql`SELECT * FROM ${b.filtered} t ${b.where} ${b.order} LIMIT ${PEOPLE_EXPORT_LIMIT}`)
  return { rows, customersEnabled: b.customersEnabled }
}

// A leading = + - @ (or tab/CR) makes a spreadsheet treat a cell as a formula.
// A display name is the member's own text, so it is neutralised, not trusted.
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function peopleCsv(rows: PersonRow[], withCustomerColumns: boolean): string {
  const header = ['Type', 'Username', 'Display name', 'Full name', 'Organisation', 'Email', 'Status', 'Email verified', ...(withCustomerColumns ? ['Customer', 'Marketing emails'] : []), 'Joined']
  const lines = [header.join(',')]
  for (const r of rows) {
    const consent = r.kind !== 'member' ? '' : r.marketingConsent === true ? 'Yes' : r.marketingConsent === false ? 'No' : 'Not asked'
    lines.push([
      r.kind === 'staff' ? 'Staff' : 'Member',
      r.username,
      r.displayName ?? '',
      r.fullName ?? '',
      r.organisation ?? '',
      r.email,
      r.status,
      r.emailVerified ? 'Yes' : 'No',
      ...(withCustomerColumns ? [r.kind === 'member' ? (r.isCustomer ? 'Yes' : 'No') : '', consent] : []),
      r.createdAt.toISOString().slice(0, 10),
    ].map(csvCell).join(','))
  }
  // The byte-order mark is for Excel, which otherwise reads UTF-8 as something
  // older and mangles every accented name in the file.
  return `﻿${lines.join('\r\n')}\r\n`
}
