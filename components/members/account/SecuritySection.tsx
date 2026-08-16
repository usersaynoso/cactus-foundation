'use client'

import { useEffect, useState } from 'react'

type EmailInfo = {
  email: string
  emailVerified: boolean
  canChange: boolean
  reason: string | null
  requiresPassword: boolean
  pendingEmail: string | null
}
type Passkey = { id: string; deviceName: string | null; createdAt: string; lastUsedAt: string | null }
type Session = { id: string; ipAddress: string | null; userAgent: string | null; lastActiveAt: string; isCurrent: boolean }
type TrustedBrowser = { id: string; deviceInfo: string | null; expiresAt: string; isCurrent: boolean }

// Cards sit in a grid, so the class's own bottom margin would double the gap,
// and each one fills its row so a short card next to a tall one still squares up.
const cardStyle: React.CSSProperties = { height: '100%', marginBottom: 0 }
// Devices and browsers accumulate; cap the list rather than let one card drag
// the row down to a screen and a half.
const listStyle: React.CSSProperties = { maxHeight: '14rem', overflowY: 'auto' }

/** A list row: description on the left, an optional action button on the right. */
function ListRow({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--color-border)' }}>
      {/* A user agent string is long and the column is half the width it was,
          so the text wraps and the button keeps its size. */}
      <span style={{ minWidth: 0, wordBreak: 'break-word', fontSize: 'var(--text-sm)' }}>{children}</span>
      {action && <span style={{ flexShrink: 0 }}>{action}</span>}
    </div>
  )
}

export default function SecuritySection() {
  const [emailInfo, setEmailInfo] = useState<EmailInfo | null>(null)
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null)
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [trustedBrowsers, setTrustedBrowsers] = useState<TrustedBrowser[] | null>(null)
  const [passwordStatus, setPasswordStatus] = useState<{ hasPassword: boolean; hasTwoFactor: boolean; passwordsEnabled: boolean; passwordRequired: boolean } | null>(null)
  const [twoFactorStatus, setTwoFactorStatus] = useState<{ enabled: boolean; method: string | null } | null>(null)
  const [recoveryRemaining, setRecoveryRemaining] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [newEmail, setNewEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [emailCode, setEmailCode] = useState('')
  // The address a code is currently out for. Seeded from the server on load so
  // a member who closed the tab while the code was in flight comes back to the
  // box that finishes the job, rather than starting again.
  const [emailPendingFor, setEmailPendingFor] = useState('')
  const [emailNotice, setEmailNotice] = useState('')
  const [emailBusy, setEmailBusy] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [totpSetup, setTotpSetup] = useState<{ qrDataUrl: string; secret: string } | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)

  function refreshAll() {
    fetch('/api/members/email').then((r) => r.json()).then((d: EmailInfo) => {
      if (!d?.email) return
      setEmailInfo(d)
      setEmailPendingFor((current) => current || d.pendingEmail || '')
    })
    fetch('/api/members/passkeys').then((r) => r.json()).then((d) => setPasskeys(d.passkeys))
    fetch('/api/members/sessions').then((r) => r.json()).then((d) => setSessions(d.sessions))
    fetch('/api/members/trusted-browsers').then((r) => r.json()).then((d) => setTrustedBrowsers(d.trustedBrowsers))
    fetch('/api/members/password').then((r) => r.json()).then(setPasswordStatus)
    fetch('/api/members/2fa').then((r) => r.json()).then(setTwoFactorStatus)
    fetch('/api/members/recovery-codes').then((r) => r.json()).then((d) => setRecoveryRemaining(d.remaining))
  }

  useEffect(refreshAll, [])

  async function requestEmailChange() {
    setEmailBusy(true)
    setError('')
    setEmailNotice('')
    try {
      const res = await fetch('/api/members/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newEmail: newEmail.trim(), currentPassword: emailPassword || undefined }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to start the email change')
      setEmailPendingFor(d.sentTo ?? newEmail.trim())
      setEmailPassword('')
      setEmailCode('')
      setEmailNotice(`We have sent a code to ${d.sentTo ?? newEmail.trim()}. Enter it below to finish.`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start the email change')
    } finally {
      setEmailBusy(false)
    }
  }

  async function confirmEmailChange() {
    setEmailBusy(true)
    setError('')
    setEmailNotice('')
    try {
      const res = await fetch('/api/members/email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: emailCode.trim() }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to confirm the new address')
      setEmailPendingFor('')
      setNewEmail('')
      setEmailCode('')
      setEmailNotice(`Your email address is now ${d.email}.`)
      refreshAll()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to confirm the new address')
    } finally {
      setEmailBusy(false)
    }
  }

  async function addPasskey() {
    setBusy(true)
    setError('')
    try {
      const { startRegistration } = await import('@simplewebauthn/browser')
      const optRes = await fetch('/api/members/auth/passkey/register-options', { method: 'POST' })
      const opts = await optRes.json()
      if (!optRes.ok) throw new Error(opts.error ?? 'Failed to start passkey registration')
      const attestation = await startRegistration({ optionsJSON: opts })
      const verifyRes = await fetch('/api/members/auth/passkey/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attestation),
      })
      const d = await verifyRes.json()
      if (!verifyRes.ok) throw new Error(d.error ?? 'Failed to add passkey')
      refreshAll()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add passkey')
    } finally {
      setBusy(false)
    }
  }

  async function removePasskey(id: string) {
    setError('')
    const res = await fetch(`/api/members/passkeys/${id}`, { method: 'DELETE' })
    const d = await res.json()
    if (!res.ok) setError(d.error ?? 'Failed to remove passkey')
    else refreshAll()
  }

  async function revokeSession(id: string) {
    await fetch(`/api/members/sessions/${id}`, { method: 'DELETE' })
    refreshAll()
  }

  async function revokeAllSessions() {
    await fetch('/api/members/sessions', { method: 'DELETE' })
    refreshAll()
  }

  async function revokeTrustedBrowser(id: string) {
    await fetch(`/api/members/trusted-browsers/${id}`, { method: 'DELETE' })
    refreshAll()
  }

  async function revokeAllTrustedBrowsers() {
    await fetch('/api/members/trusted-browsers', { method: 'DELETE' })
    refreshAll()
  }

  async function savePassword() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/members/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPassword || undefined, newPassword }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to save password')
      setCurrentPassword('')
      setNewPassword('')
      refreshAll()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save password')
    } finally {
      setBusy(false)
    }
  }

  async function startTotpSetup() {
    setError('')
    const res = await fetch('/api/members/2fa/setup-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'AUTHENTICATOR_APP' }),
    })
    const d = await res.json()
    if (!res.ok) return setError(d.error ?? 'Failed to start setup')
    setTotpSetup(d)
  }

  async function verifyTotpSetup() {
    setError('')
    const res = await fetch('/api/members/2fa/setup-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'AUTHENTICATOR_APP', code: totpCode }),
    })
    const d = await res.json()
    if (!res.ok) return setError(d.error ?? 'Invalid code')
    setTotpSetup(null)
    setTotpCode('')
    if (d.recoveryCodes) setRecoveryCodes(d.recoveryCodes)
    refreshAll()
  }

  async function removeTwoFactor() {
    setError('')
    const res = await fetch('/api/members/2fa', { method: 'DELETE' })
    const d = await res.json()
    if (!res.ok) setError(d.error ?? 'Failed to remove')
    else refreshAll()
  }

  async function regenerateRecoveryCodes() {
    setError('')
    const res = await fetch('/api/members/recovery-codes', { method: 'POST' })
    const d = await res.json()
    if (!res.ok) return setError(d.error ?? 'Failed to generate codes')
    setRecoveryCodes(d.recoveryCodes)
    refreshAll()
  }

  return (
    <div className="account-grid-container">
      <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-semibold)', margin: '0 0 var(--space-4)', color: 'var(--color-text)' }}>
        Account &amp; Security
      </h2>

      {error && <div className="alert alert-danger">{error}</div>}
      {recoveryCodes && (
        <div className="alert alert-success">
          <p style={{ margin: '0 0 var(--space-2)', fontWeight: 600 }}>Save these recovery codes somewhere safe - each can be used once:</p>
          <pre style={{ margin: 0, fontFamily: 'var(--font-mono, monospace)' }}>{recoveryCodes.join('\n')}</pre>
          <button className="btn btn-secondary btn-sm" style={{ marginTop: 'var(--space-2)' }} onClick={() => setRecoveryCodes(null)}>
            Done
          </button>
        </div>
      )}

      {/* One grid rather than fixed pairs of cards: the email panel is not
          always there, and a hard-coded row would leave a hole beside whatever
          followed it on the sites that switch it off. */}
      <div className="account-grid">
        {/* The whole card waits on the fetch, heading included: a site with this
            section switched off answers 403 here, and half an email panel with a
            "Current: …" that never resolves is worse than no panel at all. */}
        {emailInfo && (
          <div className="card" style={cardStyle}>
            <h3 className="card-title">Email address</h3>
            {emailNotice && <div className="alert alert-success">{emailNotice}</div>}
            <p style={{ margin: '0 0 var(--space-3)' }}>
              Current: <strong>{emailInfo.email}</strong>
              {!emailInfo.emailVerified && <span className="field-hint"> (not verified yet)</span>}
            </p>
            {!emailInfo.canChange ? (
              <p className="field-hint">{emailInfo.reason}</p>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="member-new-email">New email address</label>
                  <input
                    id="member-new-email"
                    type="email"
                    autoComplete="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                </div>
                {emailInfo.requiresPassword && (
                  <div className="field">
                    <label htmlFor="member-email-password">Current password</label>
                    <input
                      id="member-email-password"
                      type="password"
                      autoComplete="current-password"
                      value={emailPassword}
                      onChange={(e) => setEmailPassword(e.target.value)}
                    />
                  </div>
                )}
                <button
                  className="btn btn-secondary"
                  disabled={emailBusy || !newEmail.trim() || (emailInfo.requiresPassword && !emailPassword)}
                  onClick={requestEmailChange}
                >
                  {emailBusy ? 'Sending…' : emailPendingFor ? 'Send a new code' : 'Change email address'}
                </button>
                <p className="field-hint" style={{ marginTop: 'var(--space-2)' }}>
                  We send a code to the new address and only move your sign-in once it comes back, so a
                  typo costs you nothing.
                </p>
                {emailPendingFor && (
                  <div style={{ marginTop: 'var(--space-3)' }}>
                    <div className="field">
                      <label htmlFor="member-email-code">Code sent to {emailPendingFor}</label>
                      <input
                        id="member-email-code"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        autoComplete="one-time-code"
                        value={emailCode}
                        onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      />
                    </div>
                    <button
                      className="btn btn-primary"
                      disabled={emailBusy || emailCode.length !== 6}
                      onClick={confirmEmailChange}
                    >
                      Confirm new address
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="card" style={cardStyle}>
          <h3 className="card-title">Passkeys</h3>
          {(passkeys?.length ?? 0) === 0 && <p className="field-hint">No passkeys yet.</p>}
          {passkeys?.map((pk) => (
            <ListRow
              key={pk.id}
              action={<button className="btn btn-secondary btn-sm" onClick={() => removePasskey(pk.id)}>Remove</button>}
            >
              {pk.deviceName ?? 'Passkey'} - added {new Date(pk.createdAt).toLocaleDateString()}
            </ListRow>
          ))}
          <button className="btn btn-secondary" style={{ marginTop: 'var(--space-3)' }} disabled={busy} onClick={addPasskey}>
            🔑 Add a passkey
          </button>
        </div>

        <div className="card" style={cardStyle}>
          <h3 className="card-title">Password</h3>
          {passwordStatus?.passwordsEnabled ? (
            <>
              {passwordStatus.hasPassword && (
                <div className="field">
                  <label>Current password</label>
                  <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
                </div>
              )}
              <div className="field">
                <label>{passwordStatus.hasPassword ? 'New password' : 'Set a password'}</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>
              <button className="btn btn-secondary" disabled={busy || !newPassword} onClick={savePassword}>
                {passwordStatus.hasPassword ? 'Change password' : 'Set password'}
              </button>
              {passwordStatus.hasPassword && !twoFactorStatus?.enabled && (
                <p className="field-hint" style={{ marginTop: 'var(--space-2)' }}>
                  Set up two-factor authentication to be able to sign in with your password.
                </p>
              )}
              {passwordStatus.passwordRequired && (
                <p className="field-hint" style={{ marginTop: 'var(--space-2)' }}>
                  This site asks every member for a password, so this one can be changed but not removed.
                </p>
              )}
            </>
          ) : (
            <p className="field-hint">Password sign-in is not enabled for this site.</p>
          )}
        </div>

        <div className="card" style={cardStyle}>
          <h3 className="card-title">Two-factor authentication</h3>
          {twoFactorStatus?.enabled ? (
            <div>
              <p style={{ marginTop: 0 }}>Enabled via {twoFactorStatus.method === 'EMAIL' ? 'email code' : 'authenticator app'}.</p>
              <button className="btn btn-secondary btn-sm" onClick={removeTwoFactor}>Remove</button>
              <div style={{ marginTop: 'var(--space-3)' }}>
                <span className="field-hint">{recoveryRemaining ?? 0} recovery codes remaining. </span>
                <button className="btn btn-link" onClick={regenerateRecoveryCodes}>Regenerate codes</button>
              </div>
            </div>
          ) : totpSetup ? (
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={totpSetup.qrDataUrl} alt="Authenticator QR code" style={{ width: 180, height: 180, maxWidth: '100%' }} />
              <p className="field-hint" style={{ wordBreak: 'break-all' }}>Secret: {totpSetup.secret}</p>
              <div className="field">
                <label>Enter the 6-digit code from your app</label>
                <input type="text" inputMode="numeric" maxLength={6} value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
              </div>
              <button className="btn btn-primary" disabled={totpCode.length !== 6} onClick={verifyTotpSetup}>Verify</button>
            </div>
          ) : (
            <button className="btn btn-secondary" onClick={startTotpSetup}>Set up authenticator app</button>
          )}
        </div>

        <div className="card" style={cardStyle}>
          <h3 className="card-title">Active sessions</h3>
          <div style={listStyle}>
            {sessions?.map((s) => (
              <ListRow
                key={s.id}
                action={!s.isCurrent && <button className="btn btn-secondary btn-sm" onClick={() => revokeSession(s.id)}>Revoke</button>}
              >
                {s.userAgent ?? 'Unknown device'} - {s.ipAddress ?? 'unknown IP'} {s.isCurrent && '(this browser)'}
              </ListRow>
            ))}
          </div>
          {(sessions?.length ?? 0) > 1 && (
            <button className="btn btn-secondary" style={{ marginTop: 'var(--space-3)' }} onClick={revokeAllSessions}>
              Sign out other sessions
            </button>
          )}
        </div>

        <div className="card" style={cardStyle}>
          <h3 className="card-title">Trusted browsers</h3>
          {(trustedBrowsers?.length ?? 0) === 0 && <p className="field-hint">No trusted browsers.</p>}
          <div style={listStyle}>
            {trustedBrowsers?.map((b) => (
              <ListRow
                key={b.id}
                action={<button className="btn btn-secondary btn-sm" onClick={() => revokeTrustedBrowser(b.id)}>Revoke</button>}
              >
                {b.deviceInfo ?? 'Unknown device'} {b.isCurrent && '(this browser)'} - expires {new Date(b.expiresAt).toLocaleDateString()}
              </ListRow>
            ))}
          </div>
          {(trustedBrowsers?.length ?? 0) > 0 && (
            <button className="btn btn-secondary" style={{ marginTop: 'var(--space-3)' }} onClick={revokeAllTrustedBrowsers}>
              Revoke all
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
