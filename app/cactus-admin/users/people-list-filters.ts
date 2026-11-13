// The Users list's filters, as one value that round-trips through the address
// bar. Plain module, no 'use client': the server page parses the same query
// string the browser writes, so a shared or refreshed link opens on the same
// filtered list instead of flashing the unfiltered one first.

export type PeopleFilters = {
  q: string
  type: '' | 'staff' | 'member'
  status: '' | 'ACTIVE' | 'UNVERIFIED' | 'PENDING_VERIFICATION' | 'PENDING_APPROVAL' | 'SUSPENDED'
  customer: '' | 'yes' | 'no'
  marketing: '' | 'yes' | 'no' | 'unknown'
  sort: 'createdAt' | 'username' | 'email'
  dir: 'asc' | 'desc'
  page: number
  perPage: number
}

export const DEFAULT_FILTERS: PeopleFilters = {
  q: '',
  type: '',
  status: '',
  customer: '',
  marketing: '',
  sort: 'createdAt',
  dir: 'desc',
  page: 1,
  perPage: 25,
}

export const PER_PAGE_OPTIONS = [25, 50, 100] as const

function pick<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return value !== undefined && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

export function parsePeopleFilters(sp: Record<string, string | undefined>): PeopleFilters {
  const page = Number.parseInt(sp.page ?? '', 10)
  const perPage = Number.parseInt(sp.perPage ?? '', 10)
  return {
    q: (sp.q ?? '').slice(0, 200),
    type: pick(sp.type, ['', 'staff', 'member'] as const, ''),
    status: pick(sp.status, ['', 'ACTIVE', 'UNVERIFIED', 'PENDING_VERIFICATION', 'PENDING_APPROVAL', 'SUSPENDED'] as const, ''),
    customer: pick(sp.customer, ['', 'yes', 'no'] as const, ''),
    marketing: pick(sp.marketing, ['', 'yes', 'no', 'unknown'] as const, ''),
    sort: pick(sp.sort, ['createdAt', 'username', 'email'] as const, 'createdAt'),
    dir: pick(sp.dir, ['asc', 'desc'] as const, 'desc'),
    page: Number.isFinite(page) && page > 0 ? page : 1,
    perPage: (PER_PAGE_OPTIONS as readonly number[]).includes(perPage) ? perPage : DEFAULT_FILTERS.perPage,
  }
}

/** Only what differs from the defaults, so a plain list keeps a plain address. */
export function peopleFiltersToParams(f: PeopleFilters): URLSearchParams {
  const params = new URLSearchParams()
  for (const key of Object.keys(DEFAULT_FILTERS) as Array<keyof PeopleFilters>) {
    if (f[key] !== DEFAULT_FILTERS[key]) params.set(key, String(f[key]))
  }
  return params
}

/** Whether anything narrows the list - drives the "Clear filters" button and the empty state. */
export function hasActiveFilters(f: PeopleFilters): boolean {
  return f.q !== '' || f.type !== '' || f.status !== '' || f.customer !== '' || f.marketing !== ''
}
