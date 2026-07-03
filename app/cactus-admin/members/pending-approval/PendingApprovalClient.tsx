'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type PendingMember = { id: string; username: string; email: string; createdAt: string }

export default function PendingApprovalClient({ members, adminPath }: { members: PendingMember[]; adminPath: string }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)

  async function approve(id: string) {
    setBusyId(id)
    await fetch(`/api/admin/members/${id}/approve`, { method: 'POST' })
    setBusyId(null)
    router.refresh()
  }

  async function reject(id: string) {
    setBusyId(id)
    await fetch(`/api/admin/members/${id}/reject`, { method: 'POST' })
    setBusyId(null)
    router.refresh()
  }

  if (members.length === 0) return null

  return (
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
  )
}
