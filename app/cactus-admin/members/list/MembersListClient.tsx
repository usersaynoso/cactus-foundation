'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useAdminPath } from '@/components/admin/AdminPathContext'

type Member = {
  id: string
  username: string
  email: string
  displayName: string | null
  status: string
  trusted: boolean
  createdAt: string
  suspendedUntil: string | null
  deletionScheduledAt: string | null
}

type Permissions = { canSuspend: boolean; canApprove: boolean; canTrust: boolean; canDelete: boolean }

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'badge-green',
  PENDING_VERIFICATION: 'badge-yellow',
  PENDING_APPROVAL: 'badge-yellow',
  SUSPENDED: 'badge-red',
  DELETED: 'badge-gray',
}

export default function MembersListClient({ permissions }: { permissions: Permissions }) {
  const adminPath = useAdminPath()
  const [members, setMembers] = useState<Member[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [trusted, setTrusted] = useState('')
  const [sort, setSort] = useState('createdAt')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const perPage = 25

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), perPage: String(perPage), sort, dir })
    if (q) params.set('q', q)
    if (status) params.set('status', status)
    if (trusted) params.set('trusted', trusted)
    const res = await fetch(`/api/admin/members?${params}`)
    const d = await res.json()
    setMembers(d.members ?? [])
    setTotal(d.total ?? 0)
    setLoading(false)
  }, [page, q, status, trusted, sort, dir])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- reload sets loading flag before async fetch; standard data-load pattern
  useEffect(() => { load() }, [load])

  function toggleSort(field: string) {
    if (sort === field) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSort(field); setDir('asc') }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function runBulk(action: string) {
    if (selected.size === 0) return
    await fetch('/api/admin/members/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selected), action }),
    })
    setSelected(new Set())
    load()
  }

  const totalPages = Math.max(1, Math.ceil(total / perPage))

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Members</h1>
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
        <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value) }}>
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="PENDING_VERIFICATION">Pending verification</option>
          <option value="PENDING_APPROVAL">Pending approval</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
        <select value={trusted} onChange={(e) => { setPage(1); setTrusted(e.target.value) }}>
          <option value="">Trusted: any</option>
          <option value="true">Trusted only</option>
          <option value="false">Not trusted</option>
        </select>
      </div>

      {selected.size > 0 && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--text-sm)' }}>{selected.size} selected</span>
          {permissions.canSuspend && <button className="btn btn-secondary btn-sm" onClick={() => runBulk('suspend')}>Suspend</button>}
          {permissions.canSuspend && <button className="btn btn-secondary btn-sm" onClick={() => runBulk('unsuspend')}>Unsuspend</button>}
          {permissions.canTrust && <button className="btn btn-secondary btn-sm" onClick={() => runBulk('trust')}>Trust</button>}
          {permissions.canTrust && <button className="btn btn-secondary btn-sm" onClick={() => runBulk('untrust')}>Untrust</button>}
          {permissions.canDelete && <button className="btn btn-danger btn-sm" onClick={() => runBulk('delete')}>Delete</button>}
        </div>
      )}

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th></th>
              <th onClick={() => toggleSort('username')} style={{ cursor: 'pointer' }}>Member</th>
              <th>Email</th>
              <th onClick={() => toggleSort('status')} style={{ cursor: 'pointer' }}>Status</th>
              <th>Trusted</th>
              <th onClick={() => toggleSort('createdAt')} style={{ cursor: 'pointer' }}>Joined</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td><input type="checkbox" checked={selected.has(m.id)} onChange={() => toggleSelect(m.id)} /></td>
                <td>
                  <Link href={`/${adminPath}/members/${m.id}`} style={{ fontWeight: 500 }}>{m.username}</Link>
                  {m.displayName && <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>{m.displayName}</div>}
                </td>
                <td style={{ fontSize: '0.9rem' }}>{m.email}</td>
                <td><span className={`badge ${STATUS_BADGE[m.status] ?? 'badge-gray'}`}>{m.status.replace(/_/g, ' ')}</span></td>
                <td>{m.trusted ? '✓' : ''}</td>
                <td style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{new Date(m.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {!loading && members.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No members found.</td></tr>
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
