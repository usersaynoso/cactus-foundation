'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAdminPath } from '@/components/admin/AdminPathContext'

type PendingMember = { id: string; username: string; email: string; createdAt: string }

export default function PendingApprovalClient({ members }: { members: PendingMember[] }) {
  const adminPath = useAdminPath()
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  // A refusal (or a dropped connection, which used to leave the row's buttons
  // disabled for good) is reported rather than passing for a done deal.
  async function act(id: string, action: 'approve' | 'reject') {
    setBusyId(id)
    setError('')
    try {
      const res = await fetch(`/api/admin/members/${id}/${action}`, { method: 'POST' })
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string }
        setError(d.error ?? (action === 'approve' ? 'Could not approve that member.' : 'Could not reject that member.'))
      }
    } catch {
      setError('Could not reach the site - check your connection and try again.')
    } finally {
      setBusyId(null)
      router.refresh()
    }
  }

  const approve = (id: string) => act(id, 'approve')
  const reject = (id: string) => act(id, 'reject')

  if (members.length === 0) return null

  return (
    <>
    {error && <div className="alert alert-danger">{error}</div>}
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Member</th>
            <th>Email</th>
            <th>Registered</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td><Link href={`/${adminPath}/members/${m.id}`}>{m.username}</Link></td>
              <td style={{ fontSize: '0.9rem' }}>{m.email}</td>
              <td style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{new Date(m.createdAt).toLocaleDateString()}</td>
              <td style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button className="btn btn-primary btn-sm" disabled={busyId === m.id} onClick={() => approve(m.id)}>Approve</button>
                <button className="btn btn-danger btn-sm" disabled={busyId === m.id} onClick={() => reject(m.id)}>Reject</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  )
}
