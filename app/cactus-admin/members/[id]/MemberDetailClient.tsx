'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'

type Member = {
  id: string
  email: string
  username: string
  displayName: string | null
  bio: string | null
  websiteUrl: string | null
  status: string
  trusted: boolean
  suspensionReason: string | null
  suspendedUntil: string | null
  deletionScheduledAt: string | null
  createdAt: string
}

type Permissions = {
  canEdit: boolean
  canSuspend: boolean
  canApprove: boolean
  canTrust: boolean
  canNotes: boolean
  canDelete: boolean
}

type Note = { id: string; body: string; authorName: string | null; createdAt: string }
type Session = { id: string; ipAddress: string | null; userAgent: string | null; lastActiveAt: string }
type LogEntry = { id: string; actorName: string | null; action: string; detail: unknown; createdAt: string }

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'badge-green',
  PENDING_VERIFICATION: 'badge-yellow',
  PENDING_APPROVAL: 'badge-yellow',
  SUSPENDED: 'badge-red',
  DELETED: 'badge-gray',
}

export default function MemberDetailClient({
  member: initialMember,
  permissions,
  children,
}: {
  member: Member
  permissions: Permissions
  children?: ReactNode
}) {
  const router = useRouter()
  const [member, setMember] = useState(initialMember)
  const [displayName, setDisplayName] = useState(initialMember.displayName ?? '')
  const [bio, setBio] = useState(initialMember.bio ?? '')
  const [websiteUrl, setWebsiteUrl] = useState(initialMember.websiteUrl ?? '')
  const [suspendReason, setSuspendReason] = useState('')
  const [showSuspendForm, setShowSuspendForm] = useState(false)
  const [notes, setNotes] = useState<Note[]>([])
  const [newNote, setNewNote] = useState('')
  const [sessions, setSessions] = useState<Session[]>([])
  const [log, setLog] = useState<LogEntry[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  function loadExtras() {
    if (permissions.canNotes) {
      fetch(`/api/admin/members/${member.id}/notes`).then((r) => r.json()).then((d) => setNotes(d.notes ?? []))
    }
    fetch(`/api/admin/members/${member.id}/sessions`).then((r) => r.json()).then((d) => setSessions(d.sessions ?? []))
    fetch(`/api/admin/members/${member.id}/action-log`).then((r) => r.json()).then((d) => setLog(d.entries ?? []))
  }

  useEffect(loadExtras, [member.id, permissions.canNotes])

  async function saveProfile() {
    setError('')
    setMessage('')
    const res = await fetch(`/api/admin/members/${member.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName, bio, websiteUrl }),
    })
    const d = await res.json()
    if (!res.ok) return setError(d.error ?? 'Failed to save')
    setMessage('Profile updated.')
    loadExtras()
  }

  async function callAction(path: string, opts?: RequestInit) {
    setError('')
    const res = await fetch(path, { method: 'POST', ...opts })
    const d = await res.json()
    if (!res.ok) { setError(d.error ?? 'Action failed'); return null }
    return d
  }

  async function handleSuspend() {
    const d = await callAction(`/api/admin/members/${member.id}/suspend`, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: suspendReason || undefined }),
    })
    if (d) { setMember((m) => ({ ...m, status: d.status, suspensionReason: suspendReason })); setShowSuspendForm(false); loadExtras() }
  }

  async function handleUnsuspend() {
    const d = await callAction(`/api/admin/members/${member.id}/unsuspend`)
    if (d) { setMember((m) => ({ ...m, status: d.status, suspensionReason: null })); loadExtras() }
  }

  async function handleApprove() {
    const d = await callAction(`/api/admin/members/${member.id}/approve`)
    if (d) { setMember((m) => ({ ...m, status: d.status })); loadExtras() }
  }

  async function handleReject() {
    const res = await fetch(`/api/admin/members/${member.id}/reject`, { method: 'POST' })
    if (res.ok) router.push('../pending-approval')
  }

  async function toggleTrust() {
    const res = await fetch(`/api/admin/members/${member.id}/trust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trusted: !member.trusted }),
    })
    const d = await res.json()
    if (res.ok) setMember((m) => ({ ...m, trusted: d.trusted }))
  }

  async function addNote() {
    if (!newNote.trim()) return
    const res = await fetch(`/api/admin/members/${member.id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: newNote }),
    })
    if (res.ok) { setNewNote(''); loadExtras() }
  }

  async function revokeSession(id: string) {
    await fetch(`/api/admin/members/${member.id}/sessions/${id}`, { method: 'DELETE' })
    loadExtras()
  }

  async function revokeAllSessions() {
    await fetch(`/api/admin/members/${member.id}/sessions`, { method: 'DELETE' })
    loadExtras()
  }

  async function resetPassword() {
    await callAction(`/api/admin/members/${member.id}/reset-password`)
    setMessage('Password and two-factor configuration cleared.')
    loadExtras()
  }

  async function triggerExport() {
    const d = await callAction(`/api/admin/members/${member.id}/export-trigger`)
    if (d) setMessage(`Export ${d.status.toLowerCase()}.`)
  }

  async function handleDelete() {
    const res = await fetch(`/api/admin/members/${member.id}`, { method: 'DELETE' })
    if (res.ok) router.push('../list')
    else setError('Failed to delete member')
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{member.displayName || member.username}</h1>
          <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>@{member.username} · {member.email}</p>
        </div>
        <span className={`badge ${STATUS_BADGE[member.status] ?? 'badge-gray'}`}>{member.status.replace(/_/g, ' ')}</span>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}
      {member.deletionScheduledAt && (
        <div className="alert alert-warning">Scheduled for deletion on {new Date(member.deletionScheduledAt).toLocaleDateString()}.</div>
      )}

      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <h2 className="card-title">Status actions</h2>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {permissions.canApprove && member.status === 'PENDING_APPROVAL' && (
            <>
              <button className="btn btn-primary btn-sm" onClick={handleApprove}>Approve</button>
              <button className="btn btn-danger btn-sm" onClick={handleReject}>Reject</button>
            </>
          )}
          {permissions.canSuspend && member.status !== 'SUSPENDED' && !showSuspendForm && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowSuspendForm(true)}>Suspend</button>
          )}
          {permissions.canSuspend && member.status === 'SUSPENDED' && (
            <button className="btn btn-secondary btn-sm" onClick={handleUnsuspend}>Unsuspend</button>
          )}
          {permissions.canTrust && (
            <button className="btn btn-secondary btn-sm" onClick={toggleTrust}>{member.trusted ? 'Remove trusted flag' : 'Mark trusted'}</button>
          )}
        </div>
        {showSuspendForm && (
          <div style={{ marginTop: 'var(--space-3)' }}>
            <div className="field">
              <label>Suspension reason</label>
              <input type="text" value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} />
            </div>
            <button className="btn btn-danger btn-sm" onClick={handleSuspend}>Confirm suspend</button>
            <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'var(--space-2)' }} onClick={() => setShowSuspendForm(false)}>Cancel</button>
          </div>
        )}
      </div>

      {permissions.canEdit && (
        <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
          <h2 className="card-title">Profile</h2>
          <div className="field">
            <label>Display name</label>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="field">
            <label>Bio</label>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} />
          </div>
          <div className="field">
            <label>Website</label>
            <input type="text" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={saveProfile}>Save</button>
        </div>
      )}

      {permissions.canEdit && (
        <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
          <h2 className="card-title">Sessions</h2>
          {sessions.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>No active sessions.</p>}
          {sessions.map((s) => (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--color-border)' }}>
              <span>{s.userAgent ?? 'Unknown device'} - {s.ipAddress ?? 'unknown IP'}</span>
              <button className="btn btn-secondary btn-sm" onClick={() => revokeSession(s.id)}>Revoke</button>
            </div>
          ))}
          {sessions.length > 0 && (
            <button className="btn btn-secondary btn-sm" style={{ marginTop: 'var(--space-3)' }} onClick={revokeAllSessions}>Revoke all</button>
          )}
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
            <button className="btn btn-secondary btn-sm" onClick={resetPassword}>Reset password &amp; 2FA</button>
            <button className="btn btn-secondary btn-sm" onClick={triggerExport}>Trigger data export</button>
          </div>
        </div>
      )}

      {permissions.canNotes && (
        <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
          <h2 className="card-title">Admin notes</h2>
          <div className="field">
            <textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Add an internal note…" />
          </div>
          <button className="btn btn-secondary btn-sm" onClick={addNote}>Add note</button>
          <div style={{ marginTop: 'var(--space-3)' }}>
            {notes.map((n) => (
              <div key={n.id} style={{ padding: 'var(--space-2) 0', borderBottom: '1px solid var(--color-border)' }}>
                <p style={{ margin: 0 }}>{n.body}</p>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                  {n.authorName ?? 'Unknown'} - {new Date(n.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {children}

      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <h2 className="card-title">Action log</h2>
        {log.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>No actions recorded.</p>}
        {log.map((entry) => (
          <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--color-border)' }}>
            <span>{entry.action.replace(/_/g, ' ')} - {entry.actorName ?? 'Unknown'}</span>
            <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>{new Date(entry.createdAt).toLocaleString()}</span>
          </div>
        ))}
      </div>

      {permissions.canDelete && (
        <div className="card">
          <h2 className="card-title">Danger zone</h2>
          {!confirmDelete ? (
            <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>Delete member</button>
          ) : (
            <div>
              <p style={{ color: 'var(--color-text-secondary)' }}>This immediately deletes the member and all their data. This bypasses their own deletion grace period.</p>
              <button className="btn btn-danger btn-sm" onClick={handleDelete}>Confirm delete</button>
              <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'var(--space-2)' }} onClick={() => setConfirmDelete(false)}>Cancel</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
