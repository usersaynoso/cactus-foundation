'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useAdminPath } from '@/components/admin/AdminPathContext'
import UserActions from './UserActions'

type Role = { id: string; name: string; isProtected: boolean }

type Person = {
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
  createdAt: string
}

type Props = {
  roles: Role[]
  currentUserId: string
  currentUserIsAdmin: boolean
  canViewMembers: boolean
}

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'badge-green',
  UNVERIFIED: 'badge-yellow',
  PENDING_VERIFICATION: 'badge-yellow',
  PENDING_APPROVAL: 'badge-yellow',
  SUSPENDED: 'badge-red',
  DELETED: 'badge-gray',
}

export default function PeopleListClient({ roles, currentUserId, currentUserIsAdmin, canViewMembers }: Props) {
  const adminPath = useAdminPath()
  const [people, setPeople] = useState<Person[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [sort, setSort] = useState('createdAt')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [loading, setLoading] = useState(false)
  const perPage = 25

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), perPage: String(perPage), sort, dir })
    if (q) params.set('q', q)
    if (type) params.set('type', type)
    const res = await fetch(`/api/admin/people?${params}`)
    const d = await res.json()
    setPeople(d.people ?? [])
    setTotal(d.total ?? 0)
    setLoading(false)
  }, [page, q, type, sort, dir])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- reload sets loading flag before async fetch; standard data-load pattern
  useEffect(() => { load() }, [load])

  function toggleSort(field: string) {
    if (sort === field) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSort(field); setDir('asc') }
  }

  const totalPages = Math.max(1, Math.ceil(total / perPage))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-2)' }}>
        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.9375rem' }}>{total} total</span>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search username, email, name…"
          value={q}
          onChange={(e) => { setPage(1); setQ(e.target.value) }}
          style={{ minWidth: 220 }}
        />
        <select value={type} onChange={(e) => { setPage(1); setType(e.target.value) }}>
          <option value="">All people</option>
          <option value="staff">Staff only</option>
          {canViewMembers && <option value="member">Members only</option>}
        </select>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th onClick={() => toggleSort('username')} style={{ cursor: 'pointer' }}>Person</th>
              <th>Email</th>
              <th>Type</th>
              <th>Role / status</th>
              <th onClick={() => toggleSort('createdAt')} style={{ cursor: 'pointer' }}>Joined</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={`${p.kind}-${p.id}`} style={{ opacity: p.suspended ? 0.6 : 1 }}>
                <td>
                  {p.kind === 'member' ? (
                    <Link href={`/${adminPath}/members/${p.id}`} style={{ fontWeight: 500 }}>{p.username}</Link>
                  ) : (
                    <div style={{ fontWeight: 500 }}>{p.username}</div>
                  )}
                  {p.displayName && <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>{p.displayName}</div>}
                </td>
                <td style={{ fontSize: '0.9rem' }}>{p.email}</td>
                <td>
                  <span className={`badge ${p.kind === 'staff' ? 'badge-blue' : 'badge-gray'}`}>
                    {p.kind === 'staff' ? 'Staff' : 'Member'}
                  </span>
                </td>
                <td>
                  {p.kind === 'staff' ? (
                    <span className={`badge ${p.roleProtected ? 'badge-blue' : 'badge-gray'}`}>{p.roleName}</span>
                  ) : (
                    <span className={`badge ${STATUS_BADGE[p.status] ?? 'badge-gray'}`}>{p.status.replace(/_/g, ' ')}</span>
                  )}
                </td>
                <td style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                  {new Date(p.createdAt).toLocaleDateString()}
                </td>
                <td>
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
                    />
                  )}
                  {p.kind === 'member' && (
                    <Link href={`/${adminPath}/members/${p.id}`} className="btn btn-secondary btn-sm">View</Link>
                  )}
                </td>
              </tr>
            ))}
            {!loading && people.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No one found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          {page > 1 && <button onClick={() => setPage(page - 1)}>←</button>}
          <span>Page {page} of {totalPages}</span>
          {page < totalPages && <button onClick={() => setPage(page + 1)}>→</button>}
        </div>
      )}
    </div>
  )
}
