'use client'

import { useState, type ReactNode } from 'react'
import type { MemberDetail, MemberLogEntry, MemberNote, MemberProfileFields, MemberSessionRow } from './member-detail-types'
import { describeAction, describeUserAgent, formatDateTime, formatRelative } from './member-detail-format'

// The tab bodies of the member detail screen. Each one is handed its data and
// the callbacks that change it; none of them fetch on their own, so the screen
// above is the one place that knows what is loaded and what needs reloading.

// ---------------------------------------------------------------- Profile

type ProfileValues = { displayName: string; bio: string; websiteUrl: string }

// Only the fields the site asks members for (see page.tsx). A field the site
// does not ask for is not shown, and not sent on save either, so an old value
// sitting in it is left exactly as it was rather than blanked by an admin who
// could not see it.
export function ProfileCard({
  member,
  fields,
  canEdit,
  onSave,
}: {
  member: MemberDetail
  fields: MemberProfileFields
  canEdit: boolean
  onSave: (values: Partial<ProfileValues>) => Promise<boolean>
}) {
  const initial: ProfileValues = { displayName: member.displayName ?? '', bio: member.bio ?? '', websiteUrl: member.websiteUrl ?? '' }
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState(initial)
  const [saving, setSaving] = useState(false)
  const dirty = values.displayName !== initial.displayName || values.bio !== initial.bio || values.websiteUrl !== initial.websiteUrl

  async function save() {
    setSaving(true)
    const ok = await onSave({
      ...(fields.displayName ? { displayName: values.displayName } : {}),
      ...(fields.bioAndWebsite ? { bio: values.bio, websiteUrl: values.websiteUrl } : {}),
    })
    setSaving(false)
    if (ok) setEditing(false)
  }

  function cancel() {
    setValues(initial)
    setEditing(false)
  }

  return (
    <section className="card" aria-labelledby="mbr-profile-title">
      <div className="mbr-card-head">
        <div>
          <h2 id="mbr-profile-title" className="card-title">Public profile</h2>
          <p className="mbr-card-sub">What other people see on their member page.</p>
        </div>
        {canEdit && !editing && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>Edit</button>
        )}
      </div>

      {!editing ? (
        <dl className="mbr-facts" style={{ gridTemplateColumns: '140px minmax(0, 1fr)' }}>
          {fields.displayName && (
            <>
              <dt>Display name</dt>
              <dd style={{ textAlign: 'left' }}>{member.displayName || <Muted>Not set</Muted>}</dd>
            </>
          )}
          {fields.bioAndWebsite && (
            <>
              <dt>Bio</dt>
              <dd style={{ textAlign: 'left', whiteSpace: 'pre-wrap' }}>{member.bio || <Muted>Not set</Muted>}</dd>
              <dt>Website</dt>
              <dd style={{ textAlign: 'left' }}>
                {member.websiteUrl
                  ? <a href={member.websiteUrl} target="_blank" rel="noopener noreferrer nofollow">{member.websiteUrl}</a>
                  : <Muted>Not set</Muted>}
              </dd>
            </>
          )}
        </dl>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); if (dirty) void save() }}>
          {fields.displayName && (
            <div className="field">
              <label htmlFor="mbr-display-name">Display name</label>
              <input id="mbr-display-name" type="text" maxLength={80} value={values.displayName} onChange={(e) => setValues((v) => ({ ...v, displayName: e.target.value }))} />
            </div>
          )}
          {fields.bioAndWebsite && (
            <>
              <div className="field">
                <label htmlFor="mbr-bio">Bio</label>
                <textarea id="mbr-bio" maxLength={500} rows={4} value={values.bio} onChange={(e) => setValues((v) => ({ ...v, bio: e.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="mbr-website">Website</label>
                <input id="mbr-website" type="url" inputMode="url" placeholder="https://" maxLength={300} value={values.websiteUrl} onChange={(e) => setValues((v) => ({ ...v, websiteUrl: e.target.value }))} />
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={!dirty || saving}>{saving ? 'Saving...' : 'Save changes'}</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={cancel} disabled={saving}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- Notes

export function NotesPanel({
  notes,
  loading,
  onAdd,
  now,
}: {
  notes: MemberNote[]
  loading: boolean
  onAdd: (body: string) => Promise<boolean>
  now: number
}) {
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    const body = draft.trim()
    if (!body || saving) return
    setSaving(true)
    if (await onAdd(body)) setDraft('')
    setSaving(false)
  }

  return (
    <section className="card" aria-labelledby="mbr-notes-title">
      <div className="mbr-card-head">
        <div>
          <h2 id="mbr-notes-title" className="card-title">Internal notes</h2>
          <p className="mbr-card-sub">Only staff see these. They cannot be edited or removed once added, so write them as if they will be read back.</p>
        </div>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void submit() }} style={{ marginBottom: 'var(--space-4)' }}>
        <div className="field">
          <label htmlFor="mbr-note" className="sr-only">New note</label>
          <textarea
            id="mbr-note"
            rows={3}
            maxLength={2000}
            value={draft}
            placeholder="Rang about a late delivery, sorted with a replacement..."
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit() } }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
          <span className="mbr-card-sub">Ctrl or Cmd + Enter to add</span>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!draft.trim() || saving}>{saving ? 'Adding...' : 'Add note'}</button>
        </div>
      </form>
      {loading ? (
        <p className="mbr-card-sub">Loading notes...</p>
      ) : notes.length === 0 ? (
        <p className="mbr-empty">No notes yet.</p>
      ) : (
        <div className="mbr-stack" style={{ gap: 'var(--space-2)' }}>
          {notes.map((n) => (
            <article key={n.id} className="mbr-note">
              <p>{n.body}</p>
              <span className="mbr-card-sub" title={formatDateTime(n.createdAt)}>
                {n.authorName ?? 'Unknown'} · {formatRelative(n.createdAt, now)}
              </span>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- Security

export function SessionsCard({
  sessions,
  loading,
  canEdit,
  onRevoke,
  onRevokeAll,
  now,
}: {
  sessions: MemberSessionRow[]
  loading: boolean
  canEdit: boolean
  onRevoke: (id: string) => Promise<void>
  onRevokeAll: () => Promise<void>
  now: number
}) {
  const [confirmAll, setConfirmAll] = useState(false)
  return (
    <section className="card" aria-labelledby="mbr-sessions-title">
      <div className="mbr-card-head">
        <div>
          <h2 id="mbr-sessions-title" className="card-title">Signed-in devices</h2>
          <p className="mbr-card-sub">Everywhere they are signed in right now.</p>
        </div>
        {canEdit && sessions.length > 1 && !confirmAll && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmAll(true)}>Sign out everywhere</button>
        )}
      </div>
      {confirmAll && (
        <div className="mbr-callout mbr-callout--warning" style={{ marginBottom: 'var(--space-3)' }}>
          <p className="mbr-callout__body">Sign them out of all {sessions.length} devices? They can sign straight back in.</p>
          <div className="mbr-callout__actions">
            <button type="button" className="btn btn-danger btn-sm" onClick={() => { setConfirmAll(false); void onRevokeAll() }}>Sign out all</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmAll(false)}>Keep them</button>
          </div>
        </div>
      )}
      {loading ? (
        <p className="mbr-card-sub">Loading devices...</p>
      ) : sessions.length === 0 ? (
        <p className="mbr-empty">Not signed in anywhere.</p>
      ) : (
        <ul className="mbr-rows">
          {sessions.map((s) => (
            <li key={s.id}>
              <div style={{ minWidth: 0 }}>
                <div className="mbr-rows__primary">{describeUserAgent(s.userAgent)}</div>
                <div className="mbr-rows__secondary" title={s.userAgent ?? undefined}>
                  {s.ipAddress ?? 'Unknown address'} · active {formatRelative(s.lastActiveAt, now)}
                </div>
              </div>
              {canEdit && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => void onRevoke(s.id)}>Sign out</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function RecoveryCard({ onResetPassword, onExport }: { onResetPassword: () => Promise<void>; onExport: () => Promise<void> }) {
  const [confirmReset, setConfirmReset] = useState(false)
  return (
    <section className="card" aria-labelledby="mbr-recovery-title">
      <div className="mbr-card-head">
        <h2 id="mbr-recovery-title" className="card-title">Account help</h2>
      </div>
      <ul className="mbr-rows">
        <li>
          <div>
            <div className="mbr-rows__primary">Reset password and two-step</div>
            <div className="mbr-rows__secondary">For a member locked out of their account. They sign in with a passkey or an email link and set a new one.</div>
          </div>
          {!confirmReset ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmReset(true)}>Reset</button>
          ) : (
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => { setConfirmReset(false); void onResetPassword() }}>Confirm</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmReset(false)}>Cancel</button>
            </div>
          )}
        </li>
        <li>
          <div>
            <div className="mbr-rows__primary">Data export</div>
            <div className="mbr-rows__secondary">Prepare a copy of everything held about them, for a subject access request.</div>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void onExport()}>Prepare</button>
        </li>
      </ul>
    </section>
  )
}

export function DangerZone({ username, onDelete }: { username: string; onDelete: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const matches = typed.trim().toLowerCase() === username.toLowerCase()
  return (
    <section className="card mbr-danger" aria-labelledby="mbr-danger-title">
      <div className="mbr-card-head">
        <div>
          <h2 id="mbr-danger-title" className="card-title">Delete account</h2>
          <p className="mbr-card-sub">Removes the member and everything attached to them straight away, skipping their own grace period. There is no undo.</p>
        </div>
        {!open && <button type="button" className="btn btn-danger btn-sm" onClick={() => setOpen(true)}>Delete</button>}
      </div>
      {open && (
        <form onSubmit={(e) => { e.preventDefault(); if (matches) void onDelete() }}>
          <div className="field">
            <label htmlFor="mbr-delete-confirm">Type <strong>{username}</strong> to confirm</label>
            <input id="mbr-delete-confirm" type="text" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button type="submit" className="btn btn-danger btn-sm" disabled={!matches}>Delete for good</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setOpen(false); setTyped('') }}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- History

export function HistoryPanel({ entries, loading, now }: { entries: MemberLogEntry[]; loading: boolean; now: number }) {
  return (
    <section className="card" aria-labelledby="mbr-history-title">
      <div className="mbr-card-head">
        <div>
          <h2 id="mbr-history-title" className="card-title">Staff history</h2>
          <p className="mbr-card-sub">Everything staff have done to this account, newest first.</p>
        </div>
      </div>
      {loading ? (
        <p className="mbr-card-sub">Loading history...</p>
      ) : entries.length === 0 ? (
        <p className="mbr-empty">Nobody has touched this account yet.</p>
      ) : (
        <ol className="mbr-timeline">
          {entries.map((entry) => (
            <li key={entry.id}>
              <div className="mbr-rows__primary">{describeAction(entry.action)}</div>
              <div className="mbr-rows__secondary" title={formatDateTime(entry.createdAt)}>
                {entry.actorName ?? 'Unknown'} · {formatRelative(entry.createdAt, now)}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function Muted({ children }: { children: ReactNode }) {
  return <span style={{ color: 'var(--color-text-muted)' }}>{children}</span>
}

export type { ProfileValues }
