import type { Prisma } from '@prisma/client'

// Contract for the "core.people-customers" extension point. The lookup of
// which providers are live for a viewer is in ./people-customer-providers.ts,
// kept apart so this file (and the SQL in ./people-directory.ts) does not pull
// every module's server code in with it.
//
// Admin › Users lists staff and members. Whether one of those members has ever
// BOUGHT anything is not core's business - core has no orders - but it is the
// first thing a shop owner wants to know when looking down that list, and the
// one thing they want to filter it by. So a module that sells things registers
// a provider and answers two questions:
//
//   isCustomerSql  "is this member a customer", as a SQL boolean expression
//                  over the member's id and email. It has to be SQL rather
//                  than a lookup, because the list is filtered, counted and
//                  paginated in the database: "customers only, page 4" cannot
//                  be answered by asking about 25 rows after the fact.
//   summarise      a one-line description of what each customer on the page
//                  has bought ("3 orders · £1,240"), for those 25 rows only.
//
// Registered serverOnly in the module's manifest, with a permission: a role
// that may not see the module's customers never sees the column, the filter or
// the counts. Nothing registered (no shop, or a shop the viewer cannot see)
// means the list looks exactly as it did before this existed, Customer and
// Marketing columns included - the marketing answer is only ever collected at
// a checkout, so on a site with nothing to sell it would be a column of blanks.

export type PeopleCustomerRefs = {
  /** The member's id column, e.g. m.id. */
  memberId: Prisma.Sql
  /** The member's email column, e.g. m.email. */
  email: Prisma.Sql
}

export type PeopleCustomerSummary = {
  /** Short, shown in the row: "3 orders · £1,240". */
  label: string
  /** Longer, shown on hover: "Last ordered 2 Nov 2026". */
  title?: string
}

export type PeopleCustomerProvider = {
  isCustomerSql: (refs: PeopleCustomerRefs) => Prisma.Sql
  summarise: (people: ReadonlyArray<{ memberId: string; email: string }>) => Promise<Record<string, PeopleCustomerSummary>>
}

/** Every provider's summaries for one page of members, merged. A provider that fails is skipped, not fatal. */
export async function summariseCustomers(
  providers: PeopleCustomerProvider[],
  people: ReadonlyArray<{ memberId: string; email: string }>,
): Promise<Record<string, PeopleCustomerSummary>> {
  if (providers.length === 0 || people.length === 0) return {}
  const results = await Promise.all(
    providers.map((p) =>
      p.summarise(people).catch((err: unknown) => {
        console.error('[people-customers] provider summary failed', err)
        return {} as Record<string, PeopleCustomerSummary>
      }),
    ),
  )
  return Object.assign({}, ...results) as Record<string, PeopleCustomerSummary>
}
