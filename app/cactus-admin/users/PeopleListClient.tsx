'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAdminPath } from '@/components/admin/AdminPathContext'
import GeneratedAvatar from '@/components/members/GeneratedAvatar'
import UserActions from './UserActions'
import { PEOPLE_LIST_CSS } from './people-list-styles'
import {
  DEFAULT_FILTERS,
  PER_PAGE_OPTIONS,
  hasActiveFilters,
  peopleFiltersToParams,
  type PeopleFilters,
} from './people-list-filters'

// Admin › Users: staff and members in one searchable list.
//
// Filters live in the address bar, so a filtered list can be refreshed, shared
// or bookmarked ("customers who said yes to marketing" is one link). The chips
// above the list are counts as well as shortcuts - each says how many people
// that filter would show for the current search - and the Customer and
// Marketing columns appear only when a module that sells things says who its
// customers are (core.people-customers), for a viewer allowed to see them.

type Role = { id: string; name: string; isProtected: boolean }

type Person = {
  id: string
  kind: 'staff' | 'member'
  username: string
  email: string
  displayName: string | null
  fullName: string | null
  organisation: string | null
  roleId: string | null
  roleName: string
  roleProtected: boolean
  status: string
  suspended: boolean
  linkedToStaff: boolean
  emailVerified: boolean
  marketingConsent: boolean | null
  isCustomer: boolean
  customerSummary: { label: string; title?: string } | null
  createdAt: string
}

type Facets = {
  total: number
  staff: number
  members: number
  customers: number | null
  marketingYes: number | null
  marketingNo: number | null
  pending: number
}

type ListResponse = { people: Person[]; total: number; customersEnabled: boolean; facets: Facets | null }

type Props = {
  roles: Role[]
  currentUserId: string
  currentUserIsAdmin: boolean
  canViewMembers: boolean
  initialFilters: PeopleFilters
  /** Whether the site asks members for a display name. Off, the name they gave
   *  on their account or at checkout is the one shown. */
  displayNamesOn: boolean
}

const STATUS: Record<string, { label: string; badge: string }> = {
  ACTIVE: { label: 'Active', badge: 'badge-green' },
  UNVERIFIED: { label: 'Email not verified', badge: 'badge-yellow' },
  PENDING_VERIFICATION: { label: 'Awaiting email check', badge: 'badge-yellow' },
  PENDING_APPROVAL: { label: 'Awaiting approval', badge: 'badge-yellow' },
  SUSPENDED: { label: 'Suspended', badge: 'badge-red' },
  DELETED: { label: 'Deleted', badge: 'badge-gray' },
}

const SEARCH_DELAY_MS = 300
const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export default function PeopleListClient({ roles, currentUserId, currentUserIsAdmin, canViewMembers, initialFilters, displayNamesOn }: Props) {
  const adminPath = useAdminPath()
  const [filters, setFilters] = useState<PeopleFilters>(initialFilters)
  // What is typed, ahead of the debounced copy in `filters` that is fetched.
  const [searchText, setSearchText] = useState(initialFilters.q)
  const [data, setData] = useState<ListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  const update = useCallback((patch: Partial<PeopleFilters>) => {
    // Anything but a page turn starts again from page one.
    setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }))
  }, [])

  // Debounced search: one request when they stop typing, not one per letter.
  useEffect(() => {
    if (searchText.trim() === filters.q) return
    const t = setTimeout(() => update({ q: searchText.trim() }), SEARCH_DELAY_MS)
    return () => clearTimeout(t)
  }, [searchText, filters.q, update])

  // Keep the address bar in step, without adding a history entry per click.
  useEffect(() => {
    const url = new URL(window.location.href)
    const keep = url.searchParams.get('tab')
    url.search = ''
    if (keep) url.searchParams.set('tab', keep)
    peopleFiltersToParams(filters).forEach((v, k) => url.searchParams.set(k, v))
    if (url.href !== window.location.href) window.history.replaceState(null, '', url)
  }, [filters])

  // Fetch. A newer request aborts the one still in flight, so a slow answer to
  // an old search can never land on top of the new one.
  useEffect(() => {
    const controller = new AbortController()
    const params = peopleFiltersToParams(filters)
    params.set('sort', filters.sort)
    params.set('dir', filters.dir)
    params.set('page', String(filters.page))
    params.set('perPage', String(filters.perPage))
    fetch(`/api/admin/people?${params}`, { signal: controller.signal })
      .then(async (res) => {
        const body: unknown = await res.json().catch(() => null)
        if (!res.ok || !body || typeof body !== 'object') throw new Error('load')
        setData(body as ListResponse)
        setError('')
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError('The list did not load. Try again in a moment.')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [filters, reloadKey])

  // The loading flag goes up with every change of what is being asked for; set
  // from the handlers that change it rather than inside the effect above.
  // (React's "adjust state when a prop changes" pattern: compare with the
  // last request key held in state, during render.)
  const requestKey = `${JSON.stringify(filters)}|${reloadKey}`
  const [lastRequestKey, setLastRequestKey] = useState(requestKey)
  if (lastRequestKey !== requestKey) {
    setLastRequestKey(requestKey)
    setLoading(true)
  }

  function toggleSort(field: PeopleFilters['sort']) {
    if (filters.sort === field) update({ dir: filters.dir === 'asc' ? 'desc' : 'asc' })
    else update({ sort: field, dir: field === 'createdAt' ? 'desc' : 'asc' })
  }

  function clearFilters() {
    setSearchText('')
    setFilters((f) => ({ ...DEFAULT_FILTERS, sort: f.sort, dir: f.dir, perPage: f.perPage }))
  }

  const people = data?.people ?? []
  const total = data?.total ?? 0
  const facets = data?.facets ?? null
  const customersEnabled = data?.customersEnabled ?? false
  const totalPages = Math.max(1, Math.ceil(total / filters.perPage))
  const from = total === 0 ? 0 : (filters.page - 1) * filters.perPage + 1
  const to = Math.min(total, filters.page * filters.perPage)
  const filtering = hasActiveFilters(filters)
  const colCount = 5 + (customersEnabled ? 2 : 0)

  const exportParams = peopleFiltersToParams({ ...filters, page: 1 })
  exportParams.set('sort', filters.sort)
  exportParams.set('dir', filters.dir)
  exportParams.set('format', 'csv')

  return (
    <div className="ppl">
      <style>{PEOPLE_LIST_CSS}</style>

      {facets && (
        <div className="ppl-chips" role="group" aria-label="Quick filters">
          <Chip n={facets.total} label="Everyone" pressed={!filters.type && !filters.customer && !filters.marketing && !filters.status} onClick={() => update({ type: '', customer: '', marketing: '', status: '' })} />
          <Chip n={facets.staff} label="Staff" pressed={filters.type === 'staff'} onClick={() => update({ type: 'staff', customer: '', marketing: '', status: '' })} />
          {canViewMembers && (
            <Chip n={facets.members} label="Members" pressed={filters.type === 'member' && !filters.customer && !filters.marketing && !filters.status} onClick={() => update({ type: 'member', customer: '', marketing: '', status: '' })} />
          )}
          {facets.customers !== null && (
            <Chip n={facets.customers} label="Customers" pressed={filters.customer === 'yes' && !filters.marketing} onClick={() => update({ type: 'member', customer: 'yes', marketing: '', status: '' })} />
          )}
          {facets.marketingYes !== null && (
            <Chip n={facets.marketingYes} label="Happy to get marketing" pressed={filters.marketing === 'yes' && !filters.customer} onClick={() => update({ type: 'member', marketing: 'yes', customer: '', status: '' })} />
          )}
          {facets.pending > 0 && (
            <Chip n={facets.pending} label="Awaiting approval" pressed={filters.status === 'PENDING_APPROVAL'} onClick={() => update({ status: 'PENDING_APPROVAL', type: '', customer: '', marketing: '' })} />
          )}
        </div>
      )}

      <div className="ppl-bar">
        <div className="ppl-search">
          <span className="ppl-search__icon" aria-hidden><SearchIcon /></span>
          <input
            type="search"
            aria-label="Search people"
            placeholder="Search name, organisation, username or email"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setSearchText('') }}
          />
          {searchText && (
            <span className="ppl-search__clear">
              <button type="button" className="ppl-icon-btn" aria-label="Clear search" onClick={() => setSearchText('')}>×</button>
            </span>
          )}
        </div>

        <select aria-label="Who" value={filters.customer || filters.marketing ? 'member' : filters.type} disabled={!!(filters.customer || filters.marketing)} onChange={(e) => update({ type: e.target.value as PeopleFilters['type'] })}>
          <option value="">Staff and members</option>
          <option value="staff">Staff only</option>
          {canViewMembers && <option value="member">Members only</option>}
        </select>

        <select aria-label="Status" value={filters.status} onChange={(e) => update({ status: e.target.value as PeopleFilters['status'] })}>
          <option value="">Any status</option>
          <option value="ACTIVE">Active</option>
          <option value="PENDING_VERIFICATION">Awaiting email check</option>
          <option value="PENDING_APPROVAL">Awaiting approval</option>
          <option value="UNVERIFIED">Staff, email not verified</option>
          <option value="SUSPENDED">Suspended</option>
        </select>

        {customersEnabled && (
          <>
            <select aria-label="Customer" value={filters.customer} onChange={(e) => update({ customer: e.target.value as PeopleFilters['customer'] })}>
              <option value="">Customers or not</option>
              <option value="yes">Customers only</option>
              <option value="no">Not customers</option>
            </select>
            <select aria-label="Marketing emails" value={filters.marketing} onChange={(e) => update({ marketing: e.target.value as PeopleFilters['marketing'] })}>
              <option value="">Any marketing answer</option>
              <option value="yes">Said yes to marketing</option>
              <option value="no">Said no to marketing</option>
              <option value="unknown">Never asked</option>
            </select>
          </>
        )}

        {filtering && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>Clear filters</button>
        )}
      </div>

      <div className="ppl-meta">
        <span aria-live="polite">
          {loading && !data ? 'Loading people...' : total === 0 ? 'Nobody to show' : `Showing ${from}-${to} of ${total.toLocaleString('en-GB')}`}
        </span>
        <span style={{ display: 'inline-flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          {total > 0 && (
            <a className="btn btn-secondary btn-sm" href={`/api/admin/people?${exportParams}`} download>
              Download {filtering ? 'this list' : 'everyone'} (CSV)
            </a>
          )}
        </span>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', alignItems: 'center' }}>
          <span>{error}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setReloadKey((k) => k + 1)}>Try again</button>
        </div>
      )}

      <div className="table-wrapper ppl-table" aria-busy={loading}>
        <table>
          <thead>
            <tr>
              <SortHeader label="Person" field="username" filters={filters} onSort={toggleSort} />
              <th scope="col" className="ppl-col-type">Type</th>
              <th scope="col" className="ppl-col-status">Status</th>
              {customersEnabled && <th scope="col" className="ppl-col-customer">Customer</th>}
              {customersEnabled && <th scope="col" className="ppl-col-marketing">Marketing</th>}
              <SortHeader label="Joined" field="createdAt" filters={filters} onSort={toggleSort} className="ppl-col-joined" />
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {loading && !data && Array.from({ length: 6 }, (_, i) => (
              <tr key={`sk-${i}`} aria-hidden>
                {Array.from({ length: colCount }, (__, j) => (
                  <td key={j}><span className="ppl-skeleton" style={{ width: j === 0 ? '70%' : '50%' }} /></td>
                ))}
              </tr>
            ))}

            {people.map((p) => {
              const name = (p.kind === 'staff' || displayNamesOn ? p.displayName : null) || p.fullName || p.username
              const showHandle = name !== p.username
              const href = p.kind === 'member' ? `/${adminPath}/members/${p.id}` : null
              const status = STATUS[p.status] ?? { label: p.status.replace(/_/g, ' ').toLowerCase(), badge: 'badge-gray' }
              return (
                <tr key={`${p.kind}-${p.id}`} className={p.suspended ? 'ppl-row--suspended' : undefined}>
                  <td>
                    <div className="ppl-person">
                      <GeneratedAvatar label={name} size={32} />
                      <div className="ppl-person__text">
                        {href ? <Link href={href} className="ppl-person__name">{name}</Link> : <span className="ppl-person__name">{name}</span>}
                        {p.organisation && <div className="ppl-person__org">{p.organisation}</div>}
                        <div className="ppl-person__sub">
                          {showHandle && <>@{p.username} · </>}
                          {p.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="ppl-col-type">
                    <div className="ppl-badges">
                      {p.kind === 'staff'
                        ? <span className={`badge ${p.roleProtected ? 'badge-blue' : 'badge-gray'}`}>{p.roleName}</span>
                        : <span className="badge badge-gray">Member</span>}
                      {/* The member half of a staff account. Without this the same
                          person appears twice with no explanation, which reads as a
                          duplicate somebody ought to tidy up - they shouldn't. */}
                      {p.linkedToStaff && <span className="badge badge-blue" title="The member account belonging to a staff sign-in">Staff account</span>}
                    </div>
                  </td>
                  <td className="ppl-col-status">
                    <span className={`badge ${status.badge}`}>{status.label}</span>
                  </td>
                  {customersEnabled && (
                    <td className="ppl-col-customer">
                      {p.kind !== 'member' ? <span className="ppl-muted" aria-label="Not applicable">-</span>
                        : p.isCustomer ? (
                          <div title={p.customerSummary?.title}>
                            <span className="badge badge-green">Customer</span>
                            {p.customerSummary && <div className="ppl-person__sub" style={{ marginTop: 'var(--space-1)' }}>{p.customerSummary.label}</div>}
                          </div>
                        ) : <span className="ppl-muted">Not yet</span>}
                    </td>
                  )}
                  {customersEnabled && (
                    <td className="ppl-col-marketing">
                      {p.kind !== 'member' ? <span className="ppl-muted" aria-label="Not applicable">-</span>
                        : p.marketingConsent === true ? <span className="badge badge-green">Yes</span>
                        : p.marketingConsent === false ? <span className="badge badge-gray">No</span>
                        : <span className="ppl-muted" title="Nothing has asked them yet - treat as a no">Not asked</span>}
                    </td>
                  )}
                  <td className="ppl-col-joined ppl-muted" style={{ whiteSpace: 'nowrap' }} title={new Date(p.createdAt).toISOString()}>
                    {dateFormat.format(new Date(p.createdAt))}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {p.kind === 'staff' && p.id !== currentUserId && (
                      <UserActions
                        targetUser={{
                          id: p.id,
                          username: p.username,
                          roleId: p.roleId ?? '',
                          suspendedAt: p.suspended ? p.createdAt : null,
                          role: { id: p.roleId ?? '', name: p.roleName, isProtected: p.roleProtected },
                        }}
                        currentUserIsAdmin={currentUserIsAdmin}
                        roles={roles}
                        onChanged={() => setReloadKey((k) => k + 1)}
                      />
                    )}
                    {p.kind === 'staff' && p.id === currentUserId && <span className="ppl-muted" style={{ fontSize: 'var(--text-sm)' }}>You</span>}
                    {href && <Link href={href} className="btn btn-secondary btn-sm">Open</Link>}
                  </td>
                </tr>
              )
            })}

            {!loading && data && people.length === 0 && (
              <tr>
                <td colSpan={colCount} className="ppl-empty">
                  <p>{filtering ? 'Nobody matches those filters.' : 'Nobody here yet.'}</p>
                  {filtering && <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>Clear filters</button>}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <div className="ppl-pager">
          <label style={{ display: 'inline-flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            Per page
            <select value={filters.perPage} onChange={(e) => update({ perPage: Number(e.target.value) })}>
              {PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          {totalPages > 1 && (
            <div className="ppl-pager__buttons">
              <button type="button" className="btn btn-secondary btn-sm" disabled={filters.page <= 1} onClick={() => update({ page: filters.page - 1 })}>Previous</button>
              <span>Page {filters.page} of {totalPages}</span>
              <button type="button" className="btn btn-secondary btn-sm" disabled={filters.page >= totalPages} onClick={() => update({ page: filters.page + 1 })}>Next</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Chip({ n, label, pressed, onClick }: { n: number; label: string; pressed: boolean; onClick: () => void }) {
  return (
    <button type="button" className="ppl-chip" aria-pressed={pressed} onClick={onClick}>
      <span className="ppl-chip__n">{n.toLocaleString('en-GB')}</span>
      <span>{label}</span>
    </button>
  )
}

function SortHeader({
  label,
  field,
  filters,
  onSort,
  className,
}: {
  label: string
  field: PeopleFilters['sort']
  filters: PeopleFilters
  onSort: (field: PeopleFilters['sort']) => void
  className?: string
}) {
  const active = filters.sort === field
  return (
    <th scope="col" className={className} aria-sort={active ? (filters.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="ppl-sort" onClick={() => onSort(field)}>
        {label}
        <span aria-hidden style={{ opacity: active ? 1 : 0.35 }}>{active && filters.dir === 'asc' ? '↑' : '↓'}</span>
      </button>
    </th>
  )
}

function SearchIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}
