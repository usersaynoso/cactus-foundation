'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useUnsavedChanges } from '@/components/admin/useUnsavedChanges'
import { UnsavedChangesModal } from '@/components/admin/UnsavedChangesModal'

type SessionInfo = {
  id: string
  createdAt: string
  expiresAt: string
  current: boolean
}

type PasswordInfo = {
  hasPassword: boolean
  emailConfigured: boolean
}

type PasskeyInfo = {
  id: string
  createdAt: string
  transports: string[]
  label: string | null
}

type ProfileInfo = {
  email: string
  username: string
  displayName: string | null
}

const cardFull: React.CSSProperties = { height: '100%' }
const mutedRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--text-sm)' }

/** A list row with muted left-hand copy and an optional right-hand action button. */
function Row({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={mutedRow}>
      <span style={{ color: 'var(--color-text-muted)' }}>{children}</span>
      {action}
    </div>
  )
}

export default function AccountPage() {
  const pathname = usePathname()
  const router = useRouter()
  const { dirtyRef, pendingHref, setPendingHref } = useUnsavedChanges()
  const adminBase = pathname.replace(/\/account$/, '')

  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // Profile
  const [profile, setProfile] = useState<ProfileInfo | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [profileLoading, setProfileLoading] = useState(false)

  // Email
  const [newEmail, setNewEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)

  // Passkeys
  const [newPasskeyLoading, setNewPasskeyLoading] = useState(false)
  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([])

  // Authenticator app (TOTP)
  const [totpEnabled, setTotpEnabled] = useState<boolean | null>(null)
  const [totpSetupLoading, setTotpSetupLoading] = useState(false)
  const [totpVerifyLoading, setTotpVerifyLoading] = useState(false)
  const [totpQrDataUrl, setTotpQrDataUrl] = useState('')
  const [totpSecret, setTotpSecret] = useState('')
  const [totpCode, setTotpCode] = useState('')

  // Password
  const [passwordInfo, setPasswordInfo] = useState<PasswordInfo | null>(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [signOutOtherSessions, setSignOutOtherSessions] = useState(false)
  const [passwordLoading, setPasswordLoading] = useState(false)

  // Misc
  const [exportLoading, setExportLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    fetch('/api/account/profile')
      .then((r) => r.json())
      .then((d: ProfileInfo) => {
        setProfile(d)
        setDisplayName(d.displayName ?? '')
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/account/sessions')
      .then((r) => r.json())
      .then((d: { sessions: SessionInfo[] }) => { setSessions(d.sessions ?? []); setSessionsLoading(false) })
      .catch(() => { setSessionsLoading(false) })
  }, [])

  useEffect(() => {
    fetch('/api/account/password')
      .then((r) => r.json())
      .then((d: PasswordInfo) => setPasswordInfo(d))
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/account/totp')
      .then((r) => r.json())
      .then((d: { enabled: boolean }) => setTotpEnabled(d.enabled))
      .catch(() => {})
  }, [])

  function fetchPasskeys() {
    fetch('/api/account/passkeys')
      .then((r) => r.json())
      .then((d: { passkeys: PasskeyInfo[] }) => setPasskeys(d.passkeys ?? []))
      .catch(() => {})
  }

  useEffect(() => { fetchPasskeys() }, [])

  // Track unsaved input across the account forms so we can warn before leaving.
  useEffect(() => {
    dirtyRef.current =
      (profile ? displayName !== (profile.displayName ?? '') : false) ||
      newEmail.trim() !== '' || emailPassword !== '' ||
      currentPassword !== '' || newPassword !== ''
  }, [dirtyRef, profile, displayName, newEmail, emailPassword, currentPassword, newPassword])

  function leaveNow(href: string) {
    dirtyRef.current = false
    setPendingHref(null)
    router.push(href)
  }

  async function handleSaveProfile() {
    setProfileLoading(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: displayName || undefined }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((d as { error?: string }).error ?? 'Failed to save profile')
      setProfile((p) => p ? { ...p, displayName: displayName || null } : p)
      setMessage('Profile updated.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save profile')
    } finally {
      setProfileLoading(false)
    }
  }

  async function handleChangeEmail() {
    setEmailLoading(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch('/api/account/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newEmail, currentPassword: emailPassword || undefined }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((d as { error?: string }).error ?? 'Failed to change email')
      setProfile((p) => p ? { ...p, email: newEmail } : p)
      setNewEmail('')
      setEmailPassword('')
      setMessage('Email address updated.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to change email')
    } finally {
      setEmailLoading(false)
    }
  }

  async function handleSavePassword() {
    setPasswordLoading(true)
    setError('')
    setMessage('')
    try {
      const hadPassword = passwordInfo?.hasPassword ?? false
      const res = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(hadPassword ? { currentPassword } : {}),
          newPassword,
          signOutOtherSessions,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((d as { error?: string }).error ?? 'Failed to save password')
      setMessage(hadPassword ? 'Password updated.' : 'Password added.')
      setCurrentPassword('')
      setNewPassword('')
      setSignOutOtherSessions(false)
      setPasswordInfo((p) => (p ? { ...p, hasPassword: true } : p))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save password')
    } finally {
      setPasswordLoading(false)
    }
  }

  async function handleRemovePasskey(id: string) {
    setError('')
    const res = await fetch(`/api/account/passkeys/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setPasskeys((p) => p.filter((x) => x.id !== id))
    } else {
      const d = await res.json().catch(() => ({}))
      setError((d as { error?: string }).error ?? 'Failed to remove passkey')
    }
  }

  async function handleRevokeSession(id: string) {
    const res = await fetch(`/api/account/sessions/${id}`, { method: 'DELETE' })
    if (res.ok) setSessions((s) => s.filter((x) => x.id !== id))
  }

  async function handleRevokeAll() {
    const res = await fetch('/api/account/sessions', { method: 'DELETE' })
    if (res.ok) window.location.href = '/'
  }

  async function handleExport() {
    setExportLoading(true)
    try {
      const res = await fetch('/api/account/export')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'my-data.json'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Export failed')
    } finally {
      setExportLoading(false)
    }
  }

  async function handleDeleteAccount() {
    setDeleteLoading(true)
    setDeleteError('')
    try {
      const res = await fetch('/api/account', { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) {
        setDeleteError(d.error ?? 'Deletion failed')
      } else {
        window.location.href = '/'
      }
    } finally {
      setDeleteLoading(false)
    }
  }

  async function handleAddPasskey() {
    setNewPasskeyLoading(true)
    setError('')
    try {
      const { startRegistration } = await import('@simplewebauthn/browser')
      const optRes = await fetch('/api/auth/passkey/register-options', { method: 'POST' })
      if (!optRes.ok) {
        const d = await optRes.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error ?? 'Failed to get registration options')
      }
      const opts = await optRes.json()
      const attestation = await startRegistration({ optionsJSON: opts })
      const verifyRes = await fetch('/api/auth/passkey/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attestation }),
      })
      if (!verifyRes.ok) {
        const d = await verifyRes.json()
        throw new Error(d.error ?? 'Passkey registration failed')
      }
      setMessage('New passkey registered successfully.')
      fetchPasskeys()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setNewPasskeyLoading(false)
    }
  }

  async function handleStartTotpSetup() {
    setTotpSetupLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/totp/setup-options', { method: 'POST' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error ?? 'Failed to start authenticator setup')
      }
      const opts = (await res.json()) as { qrDataUrl: string; secret: string }
      setTotpQrDataUrl(opts.qrDataUrl)
      setTotpSecret(opts.secret)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start authenticator setup')
    } finally {
      setTotpSetupLoading(false)
    }
  }

  async function handleVerifyTotpSetup() {
    setTotpVerifyLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/totp/setup-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: totpCode }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((d as { error?: string }).error ?? 'Verification failed')
      setTotpEnabled(true)
      setTotpQrDataUrl('')
      setTotpSecret('')
      setTotpCode('')
      setMessage('Authenticator app enabled.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setTotpVerifyLoading(false)
    }
  }

  async function handleRemoveTotp() {
    setError('')
    const res = await fetch('/api/account/totp', { method: 'DELETE' })
    if (res.ok) {
      setTotpEnabled(false)
    } else {
      const d = await res.json().catch(() => ({}))
      setError((d as { error?: string }).error ?? 'Failed to remove authenticator app')
    }
  }

  const profileDirty = profile && displayName !== (profile.displayName ?? '')

  return (
    <div className="account-grid-container">
      <div className="page-header">
        <h1 className="page-title">Account settings</h1>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      <UnsavedChangesModal
        pendingHref={pendingHref}
        message="You have unsaved changes on this page. Save them first, or they will be lost."
        onCancel={() => setPendingHref(null)}
        onDiscard={() => leaveNow(pendingHref!)}
      />

      {/* Row 1: Profile + Email */}
      <div className="account-grid">
        <div className="card" style={cardFull}>
          <h2 className="card-title">Profile</h2>
          {profile === null ? <p>Loading…</p> : (
            <>
              <div className="field">
                <label>Username</label>
                <p style={{ margin: 0, fontSize: 'var(--text-base)', color: 'var(--color-text-muted)' }}>{profile.username}</p>
              </div>
              <div className="field">
                <label>Display name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Optional — shown instead of your username"
                />
              </div>
              <button
                className="btn btn-primary"
                disabled={profileLoading || !profileDirty}
                onClick={handleSaveProfile}
              >
                {profileLoading ? 'Saving…' : 'Save profile'}
              </button>
            </>
          )}
        </div>

        <div className="card" style={cardFull}>
          <h2 className="card-title">Email address</h2>
          {profile && (
            <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-muted)', margin: '0 0 1rem' }}>
              Current: <strong>{profile.email}</strong>
            </p>
          )}
          <div className="field">
            <label>New email address</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          {passwordInfo?.hasPassword && (
            <div className="field">
              <label>Current password</label>
              <input
                type="password"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
          )}
          <button
            className="btn btn-primary"
            disabled={emailLoading || !newEmail || (passwordInfo?.hasPassword ? !emailPassword : false)}
            onClick={handleChangeEmail}
          >
            {emailLoading ? 'Saving…' : 'Change email'}
          </button>
        </div>
      </div>

      {/* Row 2: Passkeys + Password */}
      <div className="account-grid">
        <div className="card" style={cardFull}>
          <h2 className="card-title">Passkeys</h2>
          {passkeys.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              {passkeys.map((pk, i) => (
                <Row
                  key={pk.id}
                  action={
                    <button className="btn btn-secondary btn-sm" onClick={() => handleRemovePasskey(pk.id)}>
                      Remove
                    </button>
                  }
                >
                  {pk.label ?? `Passkey ${i + 1}`} &mdash; added {new Date(pk.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Row>
              ))}
            </div>
          )}
          <button
            className="btn btn-secondary"
            disabled={newPasskeyLoading}
            onClick={handleAddPasskey}
          >
            {newPasskeyLoading ? 'Registering…' : '+ Add a new passkey'}
          </button>
        </div>

        <div className="card" style={cardFull}>
          <h2 className="card-title">Password</h2>
          {passwordInfo === null ? (
            <p>Loading…</p>
          ) : !passwordInfo.emailConfigured ? (
            <div className="alert alert-warning" style={{ fontSize: 'var(--text-sm)' }}>
              Set up email (Brevo or SMTP) in <a href={`${adminBase}/config`}>Settings</a> before you can add a password. The password sign-in needs email to send a one-time code.
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); handleSavePassword() }}>
              <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-muted)', margin: '0 0 1rem' }}>
                {passwordInfo.hasPassword
                  ? 'Change the password you use with the email one-time code sign-in.'
                  : 'Add a password to sign in with an email one-time code, alongside your passkeys.'}
              </p>
              <input
                type="text"
                name="username"
                autoComplete="username"
                value={profile?.email ?? ''}
                readOnly
                hidden
              />
              {passwordInfo.hasPassword && (
                <div className="field">
                  <label>Current password</label>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>
              )}
              <div className="field">
                <label>New password</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <span className="field-hint">At least 8 characters. Breached passwords are rejected.</span>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 'var(--text-sm)', cursor: 'pointer', marginBottom: '0.75rem' }}>
                <input
                  type="checkbox"
                  checked={signOutOtherSessions}
                  onChange={(e) => setSignOutOtherSessions(e.target.checked)}
                />
                Sign out of all other devices
              </label>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={passwordLoading || !newPassword || newPassword.length < 8 || (passwordInfo.hasPassword && !currentPassword)}
              >
                {passwordLoading
                  ? 'Saving…'
                  : passwordInfo.hasPassword
                    ? 'Change password'
                    : 'Add password'}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Authenticator app — full width */}
      <div className="card">
        <h2 className="card-title">Authenticator app</h2>
        {totpEnabled === null ? (
          <p>Loading…</p>
        ) : totpEnabled ? (
          <Row action={<button className="btn btn-secondary btn-sm" onClick={handleRemoveTotp}>Remove</button>}>
            <span className="badge badge-blue">Enabled</span>
          </Row>
        ) : totpQrDataUrl ? (
          <>
            <div style={{ background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '1rem', textAlign: 'center', maxWidth: 320 }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- data: URL from our own qrcode render, not an optimizable remote asset */}
              <img src={totpQrDataUrl} alt="Authenticator app QR code" style={{ width: 180, height: 180, margin: '0 auto', display: 'block' }} />
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '0.75rem 0 0.25rem' }}>
                Scan with Google Authenticator, Authy, 1Password, or similar. Can&apos;t scan? Enter this key manually:
              </p>
              <code style={{ fontSize: '0.8125rem', wordBreak: 'break-all' }}>{totpSecret}</code>
            </div>
            <div className="field" style={{ marginTop: '1rem', maxWidth: 200 }}>
              <label>Enter the 6-digit code</label>
              <input
                inputMode="numeric"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
              />
            </div>
            <button
              className="btn btn-primary"
              disabled={totpVerifyLoading || totpCode.length !== 6}
              onClick={handleVerifyTotpSetup}
            >
              {totpVerifyLoading ? 'Verifying…' : 'Verify and enable'}
            </button>
            <button
              className="btn btn-secondary"
              style={{ marginLeft: '0.5rem' }}
              onClick={() => { setTotpQrDataUrl(''); setTotpSecret(''); setTotpCode('') }}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-muted)', margin: '0 0 1rem' }}>
              Sign in with a 6-digit code from an authenticator app, as an alternative to a passkey.
            </p>
            <button className="btn btn-secondary" disabled={totpSetupLoading} onClick={handleStartTotpSetup}>
              {totpSetupLoading ? 'Starting…' : 'Set up authenticator app'}
            </button>
          </>
        )}
      </div>

      {/* Row 3: Active sessions + Your data */}
      <div className="account-grid">
        <div className="card" style={cardFull}>
          <h2 className="card-title">Active sessions</h2>
          {sessionsLoading ? <p>Loading…</p> : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem', maxHeight: '12rem', overflowY: 'auto' }}>
                {sessions.map((s) => (
                  <Row
                    key={s.id}
                    action={!s.current && (
                      <button className="btn btn-secondary btn-sm" onClick={() => handleRevokeSession(s.id)}>Revoke</button>
                    )}
                  >
                    <span style={{ color: 'var(--color-text)' }}>Session started {new Date(s.createdAt).toLocaleDateString()}</span>
                    {s.current && <span className="badge badge-blue" style={{ marginLeft: '0.5rem' }}>Current</span>}
                  </Row>
                ))}
              </div>
              <button className="btn btn-danger btn-sm" onClick={handleRevokeAll}>
                Sign out everywhere
              </button>
            </>
          )}
        </div>

        <div className="card" style={cardFull}>
          <h2 className="card-title">Your data</h2>
          <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-muted)', margin: '0 0 1rem' }}>
            Download a JSON export of your profile, passkey metadata, and active sessions.
          </p>
          <button className="btn btn-secondary" disabled={exportLoading} onClick={handleExport}>
            {exportLoading ? 'Preparing…' : 'Download my data'}
          </button>
        </div>
      </div>

      {/* Delete account — full width */}
      <div className="card" style={{ borderColor: 'var(--color-destructive-border)' }}>
        <h2 className="card-title" style={{ color: 'var(--color-destructive)' }}>Delete account</h2>
        <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-muted)', margin: '0 0 1rem' }}>
          Permanent and immediate. Your content will remain but will be attributed to a deleted user.
        </p>
        <button className="btn btn-danger" onClick={() => { setDeleteError(''); setDeleteConfirm(true) }}>Delete my account</button>
      </div>

      {deleteConfirm && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={(e) => { if (e.target === e.currentTarget && !deleteLoading) setDeleteConfirm(false) }}
        >
          <div className="card" style={{ maxWidth: '480px', width: '100%' }}>
            <h2 className="card-title" style={{ color: 'var(--color-destructive)' }}>Delete your account?</h2>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
              This cannot be undone. Your content will remain but will be attributed to a deleted user.
            </p>
            {deleteError && <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>{deleteError}</div>}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" disabled={deleteLoading} onClick={() => setDeleteConfirm(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" disabled={deleteLoading} onClick={handleDeleteAccount}>
                {deleteLoading ? 'Deleting…' : 'Yes, delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
