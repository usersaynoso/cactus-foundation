'use client'

import { useEffect, useState } from 'react'

type Invite = {
  id: string
  createdByName: string | null
  usedAt: string | null
  usedByMemberId: string | null
  revokedAt: string | null
  createdAt: string
  expiresAt: string
}

function statusFor(invite: Invite): { label: string; badge: string } {
  if (invite.usedAt) return { label: 'Used', badge: 'badge-green' }
  if (invite.revokedAt) return { label: 'Revoked', badge: 'badge-gray' }
  if (new Date(invite.expiresAt) < new Date()) return { label: 'Expired', badge: 'badge-gray' }
  return { label: 'Active', badge: 'badge-blue' }
}

export default function InvitesClient() {
  const [invites, setInvites] = useState<Invite[]>([])
  const [expiresInDays, setExpiresInDays] = useState(7)
  const [newInviteUrl, setNewInviteUrl] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  function load() {
    fetch('/api/admin/members/invites').then((r) => r.json()).then((d) => setInvites(d.invites ?? [])).catch(() => setError('Could not load the invites.'))
  }

  useEffect(load, [])

  async function createInvite() {
    setCreating(true)
    setNewInviteUrl('')
    setError('')
    try {
      const res = await fetch('/api/admin/members/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresInDays }),
      })
      const d = (await res.json().catch(() => ({}))) as { inviteUrl?: string; error?: string }
      // A refusal used to do nothing at all - no link, no word why.
      if (!res.ok || !d.inviteUrl) throw new Error(d.error ?? 'Could not create the invite.')
      setNewInviteUrl(d.inviteUrl)
      load()
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : 'Could not create the invite.')
    } finally {
      setCreating(false)
    }
  }

  async function revoke(id: string) {
    setError('')
    try {
      const res = await fetch(`/api/admin/members/invites/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string }
        setError(d.error ?? 'Could not revoke that invite - it still works.')
      }
    } catch {
      setError('Could not revoke that invite - it still works.')
    }
    load()
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <h2 className="card-title">Create an invite</h2>
        <div className="field" style={{ maxWidth: 200 }}>
          <label>Expires in (days)</label>
          <input type="number" min={1} max={365} value={expiresInDays} onChange={(e) => setExpiresInDays(Number(e.target.value))} />
        </div>
        <button className="btn btn-primary btn-sm" disabled={creating} onClick={createInvite}>
          {creating ? 'Creating…' : 'Create invite link'}
        </button>
        {error && <div className="alert alert-danger" style={{ marginTop: 'var(--space-3)' }}>{error}</div>}
        {newInviteUrl && (
          <div className="alert alert-success" style={{ marginTop: 'var(--space-3)', wordBreak: 'break-all' }}>
            {newInviteUrl}
          </div>
        )}
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Created by</th>
              <th>Created</th>
              <th>Expires</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invites.map((inv) => {
              const s = statusFor(inv)
              return (
                <tr key={inv.id}>
                  <td><span className={`badge ${s.badge}`}>{s.label}</span></td>
                  <td>{inv.createdByName ?? 'Unknown'}</td>
                  <td style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{new Date(inv.createdAt).toLocaleDateString()}</td>
                  <td style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{new Date(inv.expiresAt).toLocaleDateString()}</td>
                  <td>
                    {s.label === 'Active' && (
                      <button className="btn btn-secondary btn-sm" onClick={() => revoke(inv.id)}>Revoke</button>
                    )}
                  </td>
                </tr>
              )
            })}
            {invites.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No invites yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
