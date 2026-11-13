'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAdminPath } from '@/components/admin/AdminPathContext'
import { TabStrip } from '@/components/admin/TabStrip'
import { useTabParam } from '@/components/admin/useTabParam'
import MemberAvatar from '@/components/members/MemberAvatar'
import type {
  MemberDetail,
  MemberDetailPermissions,
  MemberLogEntry,
  MemberNote,
  MemberProfileFields,
  MemberSecuritySummary,
  MemberSessionRow,
  MemberStatusValue,
} from './member-detail-types'
import { STATUS_PRESENTATION, formatDate, memberName } from './member-detail-format'
import { memberApi } from './member-detail-api'
import { MEMBER_DETAIL_CSS } from './member-detail-styles'
import { CheckIcon, CopyIcon, ShieldIcon } from './member-detail-icons'
import { MemberSidePanel } from './MemberSidePanel'
import { DangerZone, HistoryPanel, NotesPanel, ProfileCard, RecoveryCard, SessionsCard, type ProfileValues } from './MemberTabPanels'

// The admin view of one member.
//
// Laid out as a header that says who they are and what state the account is
// in, a row of "needs doing" callouts that only appear when something does,
// then tabs for the detail. The rail on the right stays put whichever tab is
// open: account facts, the marketing answer and how they sign in.
//
// Module sections (the members.admin-member-detail extension point) arrive as
// `children`, already rendered on the server, and sit at the top of Overview -
// on a shop that is their sales, which is what most visits here are for.

const TABS = ['overview', 'notes', 'security', 'history'] as const
type Tab = (typeof TABS)[number]

type Toast = { kind: 'success' | 'error'; text: string }

export default function MemberDetailClient({
  member: initialMember,
  security,
  noteCount: initialNoteCount,
  hasModuleSections,
  permissions,
  renderedAt: now,
  fields,
  children,
}: {
  member: MemberDetail
  security: MemberSecuritySummary
  noteCount: number
  /** One clock for every "3 days ago" on the screen, taken by the server, so
   * the server and browser renders agree and the text does not shuffle. */
  renderedAt: number
  fields: MemberProfileFields
  hasModuleSections: boolean
  permissions: MemberDetailPermissions
  children?: ReactNode
}) {
  const router = useRouter()
  const adminPath = useAdminPath()
  const [member, setMember] = useState(initialMember)
  const [tab, setTab] = useTabParam<Tab>('tab', 'overview', TABS)
  const [toast, setToast] = useState<Toast | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [notes, setNotes] = useState<MemberNote[]>([])
  const [noteCount, setNoteCount] = useState(initialNoteCount)
  const [sessions, setSessions] = useState<MemberSessionRow[]>([])
  const [log, setLog] = useState<MemberLogEntry[]>([])
  const [loaded, setLoaded] = useState({ notes: false, sessions: false, log: false })

  const notify = useCallback((kind: Toast['kind'], text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ kind, text })
    toastTimer.current = setTimeout(() => setToast(null), kind === 'error' ? 8000 : 4000)
  }, [])
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  const base = `/api/admin/members/${member.id}`

  const loadNotes = useCallback(async () => {
    if (!permissions.canNotes) return
    const r = await memberApi<{ notes: MemberNote[] }>(`${base}/notes`)
    if (r.ok) { setNotes(r.data.notes); setNoteCount(r.data.notes.length) }
    setLoaded((l) => ({ ...l, notes: true }))
  }, [base, permissions.canNotes])
  const loadSessions = useCallback(async () => {
    const r = await memberApi<{ sessions: MemberSessionRow[] }>(`${base}/sessions`)
    if (r.ok) setSessions(r.data.sessions)
    setLoaded((l) => ({ ...l, sessions: true }))
  }, [base])
  const loadLog = useCallback(async () => {
    const r = await memberApi<{ entries: MemberLogEntry[] }>(`${base}/action-log`)
    if (r.ok) setLog(r.data.entries)
    setLoaded((l) => ({ ...l, log: true }))
  }, [base])

  // First load of the three lists. Each loader only sets state once its fetch
  // has answered, never synchronously, so this is a subscription to the server
  // rather than a render-time state change.
  useEffect(() => {
    const loaders = [loadNotes, loadSessions, loadLog]
    void Promise.all(loaders.map((load) => load()))
  }, [loadNotes, loadSessions, loadLog])

  // Runs an action, says how it went, and refreshes the history so the entry
  // it just wrote is there when somebody looks.
  async function act<T>(path: string, body: unknown, success: string, apply?: (data: T) => void): Promise<boolean> {
    const r = await memberApi<T>(path, { method: 'POST', body })
    if (!r.ok) { notify('error', r.error); return false }
    apply?.(r.data)
    notify('success', success)
    void loadLog()
    return true
  }

  const setStatus = (status: MemberStatusValue, extra: Partial<MemberDetail> = {}) =>
    setMember((m) => ({ ...m, status, ...extra }))

  const handlers = {
    verify: () => act<{ status: MemberStatusValue; emailVerifiedAt: string | null }>(`${base}/verify`, {}, 'Email marked as verified.', (d) =>
      setStatus(d.status, { emailVerified: true, emailVerifiedAt: d.emailVerifiedAt })),
    approve: () => act<{ status: MemberStatusValue }>(`${base}/approve`, {}, 'Approved. They can sign in now.', (d) => setStatus(d.status)),
    reject: async () => {
      const r = await memberApi(`${base}/reject`, { method: 'POST', body: {} })
      if (!r.ok) return notify('error', r.error)
      router.push(`/${adminPath}/users?tab=pending-approval`)
    },
    suspend: (reason: string, until: string) =>
      act<{ status: MemberStatusValue }>(
        `${base}/suspend`,
        { reason: reason || undefined, until: until ? new Date(`${until}T23:59:59`).toISOString() : undefined },
        'Suspended and signed out everywhere.',
        (d) => {
          setStatus(d.status, { suspensionReason: reason || null, suspendedUntil: until ? new Date(`${until}T23:59:59`).toISOString() : null })
          setSessions([])
        },
      ),
    unsuspend: () => act<{ status: MemberStatusValue }>(`${base}/unsuspend`, {}, 'Unsuspended.', (d) =>
      setStatus(d.status, { suspensionReason: null, suspendedUntil: null })),
    toggleTrust: () => act<{ trusted: boolean }>(`${base}/trust`, { trusted: !member.trusted }, member.trusted ? 'No longer trusted.' : 'Marked as trusted.', (d) =>
      setMember((m) => ({ ...m, trusted: d.trusted }))),
  }

  async function saveProfile(values: Partial<ProfileValues>): Promise<boolean> {
    const r = await memberApi<{ member: { displayName: string | null; bio: string | null; websiteUrl: string | null } }>(base, {
      method: 'PATCH',
      body: values,
    })
    if (!r.ok) { notify('error', r.error); return false }
    setMember((m) => ({ ...m, displayName: r.data.member.displayName, bio: r.data.member.bio, websiteUrl: r.data.member.websiteUrl }))
    notify('success', 'Profile saved.')
    void loadLog()
    return true
  }

  async function addNote(body: string): Promise<boolean> {
    const r = await memberApi(`${base}/notes`, { method: 'POST', body: { body } })
    if (!r.ok) { notify('error', r.error); return false }
    notify('success', 'Note added.')
    void loadNotes()
    return true
  }

  async function revokeSession(id: string) {
    const r = await memberApi(`${base}/sessions/${id}`, { method: 'DELETE' })
    if (!r.ok) return notify('error', r.error)
    setSessions((s) => s.filter((row) => row.id !== id))
    notify('success', 'Signed out of that device.')
    void loadLog()
  }

  async function revokeAllSessions() {
    const r = await memberApi(`${base}/sessions`, { method: 'DELETE' })
    if (!r.ok) return notify('error', r.error)
    setSessions([])
    notify('success', 'Signed out everywhere.')
    void loadLog()
  }

  async function resetPassword() {
    await act(`${base}/reset-password`, {}, 'Password and two-step cleared.')
  }

  async function triggerExport() {
    await act<{ status: string }>(`${base}/export-trigger`, {}, 'Data export requested.')
  }

  async function deleteMember() {
    const r = await memberApi(base, { method: 'DELETE' })
    if (!r.ok) return notify('error', r.error)
    router.push(`/${adminPath}/users`)
  }

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(member.email)
      notify('success', 'Email address copied.')
    } catch {
      notify('error', 'Could not copy - select it by hand instead.')
    }
  }

  const tabItems = [
    { key: 'overview' as const, label: 'Overview' },
    ...(permissions.canNotes ? [{ key: 'notes' as const, label: <>Notes{noteCount > 0 && <CountPill n={noteCount} />}</> }] : []),
    { key: 'security' as const, label: 'Sign-in & security' },
    { key: 'history' as const, label: 'History' },
  ]
  const activeTab: Tab = tab === 'notes' && !permissions.canNotes ? 'overview' : tab

  return (
    <div className="mbr-page">
      <style>{MEMBER_DETAIL_CSS}</style>

      <Link href={`/${adminPath}/users`} className="mbr-back">‹ All people</Link>

      <MemberHero
        member={member}
        permissions={permissions}
        displayNamesOn={fields.displayName}
        today={new Date(now).toISOString().slice(0, 10)}
        onCopyEmail={copyEmail}
        onToggleTrust={handlers.toggleTrust}
        onUnsuspend={handlers.unsuspend}
        onSuspend={handlers.suspend}
      />

      <AttentionCallouts member={member} permissions={permissions} onVerify={handlers.verify} onApprove={handlers.approve} onReject={handlers.reject} onUnsuspend={handlers.unsuspend} />

      <div className="mbr-layout">
        <div className="mbr-main">
          <TabStrip items={tabItems.map((t) => ({ key: t.key, label: t.label, active: activeTab === t.key, onClick: () => setTab(t.key) }))} />

          {activeTab === 'overview' && (
            <div className="mbr-stack">
              {hasModuleSections && children}
              {(fields.displayName || fields.bioAndWebsite) && (
                <ProfileCard key={`${member.displayName}|${member.bio}|${member.websiteUrl}`} member={member} fields={fields} canEdit={permissions.canEdit} onSave={saveProfile} />
              )}
            </div>
          )}
          {activeTab === 'notes' && (
            <NotesPanel notes={notes} loading={!loaded.notes} onAdd={addNote} now={now} />
          )}
          {activeTab === 'security' && (
            <div className="mbr-stack">
              <SessionsCard sessions={sessions} loading={!loaded.sessions} canEdit={permissions.canEdit} onRevoke={revokeSession} onRevokeAll={revokeAllSessions} now={now} />
              {permissions.canEdit && <RecoveryCard onResetPassword={resetPassword} onExport={triggerExport} />}
              {permissions.canDelete && <DangerZone username={member.username} onDelete={deleteMember} />}
            </div>
          )}
          {activeTab === 'history' && <HistoryPanel entries={log} loading={!loaded.log} now={now} />}
        </div>

        <MemberSidePanel member={member} fields={fields} security={{ ...security, activeSessionCount: loaded.sessions ? sessions.length : security.activeSessionCount }} now={now} />
      </div>

      {toast && (
        <div className={`mbr-toast${toast.kind === 'error' ? ' mbr-toast--error' : ''}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
          <span style={{ flex: 1 }}>{toast.text}</span>
          <button type="button" className="mbr-icon-btn" style={{ color: 'inherit' }} aria-label="Dismiss" onClick={() => setToast(null)}>×</button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Header

function MemberHero({
  member,
  permissions,
  displayNamesOn,
  today,
  onCopyEmail,
  onToggleTrust,
  onSuspend,
  onUnsuspend,
}: {
  member: MemberDetail
  permissions: MemberDetailPermissions
  displayNamesOn: boolean
  today: string
  onCopyEmail: () => void
  onToggleTrust: () => Promise<boolean>
  onSuspend: (reason: string, until: string) => Promise<boolean>
  onUnsuspend: () => Promise<boolean>
}) {
  const [suspending, setSuspending] = useState(false)
  const [reason, setReason] = useState('')
  const [until, setUntil] = useState('')
  const [busy, setBusy] = useState(false)
  const status = STATUS_PRESENTATION[member.status]
  const name = memberName(member, displayNamesOn)

  async function confirmSuspend() {
    setBusy(true)
    const ok = await onSuspend(reason.trim(), until)
    setBusy(false)
    if (ok) { setSuspending(false); setReason(''); setUntil('') }
  }

  return (
    <>
      <header className="card mbr-hero">
        <div className="mbr-hero__avatar">
          <MemberAvatar memberId={member.id} username={member.username} displayName={name} avatarChoice={member.avatarChoice} uploadedUrl={member.avatarUrl} size={72} />
        </div>
        <div style={{ minWidth: 0 }}>
          <h1 className="mbr-hero__name">{name}</h1>
          {(member.organisation || (member.fullName && member.fullName !== name)) && (
            <p className="mbr-hero__sub">
              {[member.fullName && member.fullName !== name ? member.fullName : null, member.organisation].filter(Boolean).join(' · ')}
            </p>
          )}
          <div className="mbr-hero__meta">
            <span>@{member.username}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
              <a href={`mailto:${member.email}`}>{member.email}</a>
              <button type="button" className="mbr-icon-btn" aria-label="Copy email address" title="Copy email address" onClick={onCopyEmail}><CopyIcon /></button>
            </span>
            <span>Joined {formatDate(member.createdAt)}</span>
          </div>
          <div className="mbr-hero__badges">
            <span className={`badge ${status.badge}`} title={status.hint}>{status.label}</span>
            {member.emailVerified
              ? <span className="badge badge-green" title={member.emailVerifiedAt ? `Verified ${formatDate(member.emailVerifiedAt)}` : undefined}><CheckIcon /> Email verified</span>
              : <span className="badge badge-yellow">Email not verified</span>}
            {member.trusted && <span className="badge badge-primary" title="Flagged as trusted by staff"><ShieldIcon /> Trusted</span>}
            {member.marketingConsent === true && <span className="badge badge-green">Marketing: yes</span>}
            {member.marketingConsent === false && <span className="badge badge-gray">Marketing: no</span>}
            {member.isStaff && <span className="badge badge-blue">Staff account</span>}
          </div>
        </div>
        <div className="mbr-hero__actions">
          {permissions.canTrust && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void onToggleTrust()}>
              {member.trusted ? 'Remove trusted' : 'Mark trusted'}
            </button>
          )}
          {permissions.canSuspend && member.status === 'SUSPENDED' && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void onUnsuspend()}>Unsuspend</button>
          )}
          {permissions.canSuspend && member.status !== 'SUSPENDED' && member.status !== 'DELETED' && !suspending && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSuspending(true)}>Suspend</button>
          )}
        </div>
      </header>

      {suspending && (
        <form className="mbr-callout mbr-callout--danger" onSubmit={(e) => { e.preventDefault(); void confirmSuspend() }}>
          <div style={{ flex: '1 1 320px' }}>
            <p className="mbr-callout__title">Suspend {name}?</p>
            <p className="mbr-callout__body">They are signed out everywhere and cannot sign back in. If email is set up they are told, with the reason if you give one.</p>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginTop: 'var(--space-3)' }}>
              <div className="field" style={{ flex: '2 1 220px', margin: 0 }}>
                <label htmlFor="mbr-suspend-reason">Reason (optional, they will see it)</label>
                <input id="mbr-suspend-reason" type="text" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <div className="field" style={{ flex: '1 1 160px', margin: 0 }}>
                <label htmlFor="mbr-suspend-until">Until (optional)</label>
                <input id="mbr-suspend-until" type="date" min={today} value={until} onChange={(e) => setUntil(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="mbr-callout__actions" style={{ alignSelf: 'flex-end' }}>
            <button type="submit" className="btn btn-danger btn-sm" disabled={busy}>{busy ? 'Suspending...' : 'Suspend'}</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSuspending(false)} disabled={busy}>Cancel</button>
          </div>
        </form>
      )}
    </>
  )
}

// ---------------------------------------------------------------- Callouts

// Only what needs a decision or explains why the account is not working. Each
// one carries its own buttons, so the fix sits next to the problem.
function AttentionCallouts({
  member,
  permissions,
  onVerify,
  onApprove,
  onReject,
  onUnsuspend,
}: {
  member: MemberDetail
  permissions: MemberDetailPermissions
  onVerify: () => Promise<boolean>
  onApprove: () => Promise<boolean>
  onReject: () => Promise<void>
  onUnsuspend: () => Promise<boolean>
}) {
  const [confirmVerify, setConfirmVerify] = useState(false)
  const [confirmReject, setConfirmReject] = useState(false)
  const [busy, setBusy] = useState(false)

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    await fn()
    setBusy(false)
  }

  return (
    <>
      {member.deletionScheduledAt && (
        <div className="mbr-callout mbr-callout--warning" role="note">
          <div>
            <p className="mbr-callout__title">Closing their account</p>
            <p className="mbr-callout__body">They asked to delete their account. Everything goes on {formatDate(member.deletionScheduledAt)} unless they change their mind first.</p>
          </div>
        </div>
      )}

      {member.status === 'SUSPENDED' && (
        <div className="mbr-callout mbr-callout--danger" role="note">
          <div>
            <p className="mbr-callout__title">Suspended{member.suspendedUntil ? ` until ${formatDate(member.suspendedUntil)}` : ''}</p>
            <p className="mbr-callout__body">{member.suspensionReason ? `Reason given: ${member.suspensionReason}` : 'No reason was recorded.'}</p>
          </div>
          {permissions.canSuspend && (
            <div className="mbr-callout__actions">
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void run(onUnsuspend)}>Unsuspend</button>
            </div>
          )}
        </div>
      )}

      {member.status === 'PENDING_APPROVAL' && (
        <div className="mbr-callout mbr-callout--info" role="note">
          <div>
            <p className="mbr-callout__title">Waiting for approval</p>
            <p className="mbr-callout__body">
              {confirmReject ? 'Rejecting removes the account entirely. They would have to sign up again.' : 'They cannot sign in until somebody lets them in.'}
            </p>
          </div>
          {permissions.canApprove && (
            <div className="mbr-callout__actions">
              {!confirmReject ? (
                <>
                  <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void run(onApprove)}>Approve</button>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setConfirmReject(true)}>Reject</button>
                </>
              ) : (
                <>
                  <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => void run(onReject)}>Reject and remove</button>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setConfirmReject(false)}>Cancel</button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {!member.emailVerified && member.status !== 'DELETED' && (
        <div className="mbr-callout mbr-callout--warning" role="note">
          <div>
            <p className="mbr-callout__title">{confirmVerify ? `Is ${member.email} definitely theirs?` : 'Email address not verified'}</p>
            <p className="mbr-callout__body">
              {confirmVerify
                ? 'Marking it verified counts the same as them clicking the link. Anything on the site that matches things up by email address, such as past orders placed as a guest, will treat it as theirs. Only do this once you are sure.'
                : 'They have not clicked the link in their verification email. If you have confirmed the address another way - they rang, or replied from it - you can mark it verified yourself.'}
            </p>
          </div>
          {permissions.canApprove && (
            <div className="mbr-callout__actions">
              {!confirmVerify ? (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setConfirmVerify(true)}>Mark as verified</button>
              ) : (
                <>
                  <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void run(async () => { if (await onVerify()) setConfirmVerify(false) })}>
                    {busy ? 'Verifying...' : 'Yes, mark verified'}
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setConfirmVerify(false)}>Cancel</button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}

function CountPill({ n }: { n: number }) {
  return (
    <span
      aria-label={`${n} notes`}
      style={{ marginLeft: 'var(--space-2)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', padding: '0 var(--space-2)', borderRadius: 'var(--radius-full)', background: 'var(--color-bg-subtle)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
    >
      {n}
    </span>
  )
}
