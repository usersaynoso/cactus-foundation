'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'

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

export default function AccountPage() {
  const pathname = usePathname()
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

  // Password
  const [passwordInfo, setPasswordInfo] = useState<PasswordInfo | null>(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [signOutOtherSessions, setSignOutOtherSessions] = useState(false)
  const [passwordLoading, setPasswordLoading] = useState(false)

  // Misc
  const [exportLoading, setExportLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

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

  function fetchPasskeys() {
    fetch('/api/account/passkeys')
      .then((r) => r.json())
      .then((d: { passkeys: PasskeyInfo[] }) => setPasskeys(d.passkeys ?? []))
      .catch(() => {})
  }

  useEffect(() => { fetchPasskeys() }, [])

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
    const res = await fetch('/api/account', { method: 'DELETE' })
    const d = await res.json()
    if (!res.ok) {
      setError(d.error ?? 'Deletion failed')
      setDeleteConfirm(false)
    } else {
      window.location.href = '/'
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

  const profileDirty = profile && displayName !== (profile.displayName ?? '')

  const cardFull: React.CSSProperties = { height: '100%' }

  return (
    <div className="account-grid-container">
      <div className="page-header">
        <h1 className="page-title">Account settings</h1>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

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
                <div key={pk.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9375rem' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    {pk.label ?? `Passkey ${i + 1}`} &mdash; added {new Date(pk.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleRemovePasskey(pk.id)}
                  >
                    Remove
                  </button>
                </div>
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
            <div className="alert alert-warning" style={{ fontSize: '0.875rem' }}>
              Set up email (Brevo or SMTP) in <a href={`${adminBase}/config`}>Settings</a> before you can add a password. The password sign-in needs email to send a one-time code.
            </div>
          ) : (
            <>
              <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-muted)', margin: '0 0 1rem' }}>
                {passwordInfo.hasPassword
                  ? 'Change the password you use with the email one-time code sign-in.'
                  : 'Add a password to sign in with an email one-time code, alongside your passkeys.'}
              </p>
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
                className="btn btn-primary"
                disabled={passwordLoading || !newPassword || newPassword.length < 8 || (passwordInfo.hasPassword && !currentPassword)}
                onClick={handleSavePassword}
              >
                {passwordLoading
                  ? 'Saving…'
                  : passwordInfo.hasPassword
                    ? 'Change password'
                    : 'Add password'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Row 3: Active sessions + Your data */}
      <div className="account-grid">
        <div className="card" style={cardFull}>
          <h2 className="card-title">Active sessions</h2>
          {sessionsLoading ? <p>Loading…</p> : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem', maxHeight: '12rem', overflowY: 'auto' }}>
                {sessions.map((s) => (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9375rem' }}>
                    <div>
                      <span>Session started {new Date(s.createdAt).toLocaleDateString()}</span>
                      {s.current && <span className="badge badge-blue" style={{ marginLeft: '0.5rem' }}>Current</span>}
                    </div>
                    {!s.current && (
                      <button className="btn btn-secondary btn-sm" onClick={() => handleRevokeSession(s.id)}>Revoke</button>
                    )}
                  </div>
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
        {!deleteConfirm ? (
          <button className="btn btn-danger" onClick={() => setDeleteConfirm(true)}>Delete my account</button>
        ) : (
          <div className="alert alert-danger">
            <p style={{ margin: '0 0 0.75rem' }}>Are you sure? This cannot be undone.</p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-danger btn-sm" onClick={handleDeleteAccount}>Yes, delete</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setDeleteConfirm(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
