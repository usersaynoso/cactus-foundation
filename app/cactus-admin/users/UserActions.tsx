'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAdminConfirm } from '@/components/admin/useAdminConfirm'

type Role = { id: string; name: string; isProtected: boolean }
type TargetUser = { id: string; username: string; roleId: string; suspendedAt: string | null; role: Role }

type Props = {
  targetUser: TargetUser
  currentUserIsAdmin: boolean
  roles: Role[]
  /** Called after a change lands, so a list that fetched its rows itself can reload them. */
  onChanged?: () => void
}

export default function UserActions({ targetUser, currentUserIsAdmin, roles, onChanged }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedRoleId, setSelectedRoleId] = useState(targetUser.roleId)
  const [askConfirm, confirmNode] = useAdminConfirm()

  // Non-admin users cannot act on admin-role users
  if (targetUser.role.isProtected && !currentUserIsAdmin) {
    return null
  }

  async function patch(body: Record<string, unknown>) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/users/${targetUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Action failed')
      router.refresh()
      onChanged?.()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!(await askConfirm({ title: `Delete user "${targetUser.username}"?`, message: 'This cannot be undone.' }))) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/users/${targetUser.id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Delete failed')
      router.refresh()
      onChanged?.()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Delete failed')
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', flexWrap: 'wrap' }}>
      {confirmNode}
      {error && <span style={{ color: 'var(--color-destructive)', fontSize: 'var(--text-sm)' }}>{error}</span>}

      {currentUserIsAdmin && (
        <select
          value={selectedRoleId}
          onChange={(e) => setSelectedRoleId(e.target.value)}
          onBlur={() => {
            if (selectedRoleId !== targetUser.roleId) {
              patch({ roleId: selectedRoleId })
            }
          }}
          style={{ padding: 'var(--space-1) var(--space-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)', background: 'var(--color-surface)', color: 'var(--color-text)', fontFamily: 'inherit' }}
          disabled={loading}
        >
          {roles.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      )}

      {targetUser.suspendedAt ? (
        <button className="btn btn-secondary btn-sm" disabled={loading} onClick={() => patch({ suspend: false })}>
          Unsuspend
        </button>
      ) : (
        <button className="btn btn-secondary btn-sm" disabled={loading} onClick={() => patch({ suspend: true })}>
          Suspend
        </button>
      )}

      <button className="btn btn-danger btn-sm" disabled={loading} onClick={handleDelete}>
        Delete
      </button>
    </div>
  )
}
