'use client'

import { useEffect, useState } from 'react'

type Passkey = { id: string; deviceName: string | null; createdAt: string; lastUsedAt: string | null }
type Session = { id: string; ipAddress: string | null; userAgent: string | null; lastActiveAt: string; isCurrent: boolean }
type TrustedBrowser = { id: string; deviceInfo: string | null; expiresAt: string; isCurrent: boolean }

export default function SecuritySection() {
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null)
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [trustedBrowsers, setTrustedBrowsers] = useState<TrustedBrowser[] | null>(null)
  const [passwordStatus, setPasswordStatus] = useState<{ hasPassword: boolean; hasTwoFactor: boolean; passwordsEnabled: boolean } | null>(null)
  const [twoFactorStatus, setTwoFactorStatus] = useState<{ enabled: boolean; method: string | null } | null>(null)
  const [recoveryRemaining, setRecoveryRemaining] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [totpSetup, setTotpSetup] = useState<{ qrDataUrl: string; secret: string } | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)

  function refreshAll() {
    fetch('/api/members/passkeys').then((r) => r.json()).then((d) => setPasskeys(d.passkeys))
    fetch('/api/members/sessions').then((r) => r.json()).then((d) => setSessions(d.sessions))
    fetch('/api/members/trusted-browsers').then((r) => r.json()).then((d) => setTrustedBrowsers(d.trustedBrowsers))
    fetch('/api/members/password').then((r) => r.json()).then(setPasswordStatus)
    fetch('/api/members/2fa').then((r) => r.json()).then(setTwoFactorStatus)
    fetch('/api/members/recovery-codes').then((r) => r.json()).then((d) => setRecoveryRemaining(d.remaining))
  }

  useEffect(refreshAll, [])

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
    <div>
      <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-semibold)', margin: '0 0 var(--space-4)', color: 'var(--color-text)' }}>
        Security
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

      <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 'var(--space-5) 0 var(--space-2)', color: 'var(--color-text)' }}>Passkeys</h3>
      {passkeys?.map((pk) => (
        <div key={pk.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--color-border)' }}>
          <span>{pk.deviceName ?? 'Passkey'} - added {new Date(pk.createdAt).toLocaleDateString()}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => removePasskey(pk.id)}>Remove</button>
        </div>
      ))}
      <button className="btn btn-secondary" style={{ marginTop: 'var(--space-3)' }} disabled={busy} onClick={addPasskey}>
        🔑 Add a passkey
      </button>

      <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 'var(--space-6) 0 var(--space-2)', color: 'var(--color-text)' }}>Password</h3>
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
              Set up two-factor authentication below to be able to sign in with your password.
            </p>
          )}
        </>
      ) : (
        <p className="field-hint">Password sign-in is not enabled for this site.</p>
      )}

      <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 'var(--space-6) 0 var(--space-2)', color: 'var(--color-text)' }}>Two-factor authentication</h3>
      {twoFactorStatus?.enabled ? (
        <div>
          <p>Enabled via {twoFactorStatus.method === 'EMAIL' ? 'email code' : 'authenticator app'}.</p>
          <button className="btn btn-secondary btn-sm" onClick={removeTwoFactor}>Remove</button>
          <div style={{ marginTop: 'var(--space-3)' }}>
            <span className="field-hint">{recoveryRemaining ?? 0} recovery codes remaining. </span>
            <button className="btn btn-link" onClick={regenerateRecoveryCodes}>Regenerate codes</button>
          </div>
        </div>
      ) : totpSetup ? (
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={totpSetup.qrDataUrl} alt="Authenticator QR code" style={{ width: 180, height: 180 }} />
          <p className="field-hint">Secret: {totpSetup.secret}</p>
          <div className="field">
            <label>Enter the 6-digit code from your app</label>
            <input type="text" inputMode="numeric" maxLength={6} value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
          </div>
          <button className="btn btn-primary" disabled={totpCode.length !== 6} onClick={verifyTotpSetup}>Verify</button>
        </div>
      ) : (
        <button className="btn btn-secondary" onClick={startTotpSetup}>Set up authenticator app</button>
      )}

      <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 'var(--space-6) 0 var(--space-2)', color: 'var(--color-text)' }}>Active sessions</h3>
      {sessions?.map((s) => (
        <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--color-border)' }}>
          <span>{s.userAgent ?? 'Unknown device'} - {s.ipAddress ?? 'unknown IP'} {s.isCurrent && '(this browser)'}</span>
          {!s.isCurrent && <button className="btn btn-secondary btn-sm" onClick={() => revokeSession(s.id)}>Revoke</button>}
        </div>
      ))}
      {(sessions?.length ?? 0) > 1 && (
        <button className="btn btn-secondary" style={{ marginTop: 'var(--space-3)' }} onClick={revokeAllSessions}>
          Sign out other sessions
        </button>
      )}

      <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 'var(--space-6) 0 var(--space-2)', color: 'var(--color-text)' }}>Trusted browsers</h3>
      {(trustedBrowsers?.length ?? 0) === 0 && <p className="field-hint">No trusted browsers.</p>}
      {trustedBrowsers?.map((b) => (
        <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--color-border)' }}>
          <span>{b.deviceInfo ?? 'Unknown device'} {b.isCurrent && '(this browser)'} - expires {new Date(b.expiresAt).toLocaleDateString()}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => revokeTrustedBrowser(b.id)}>Revoke</button>
        </div>
      ))}
      {(trustedBrowsers?.length ?? 0) > 0 && (
        <button className="btn btn-secondary" style={{ marginTop: 'var(--space-3)' }} onClick={revokeAllTrustedBrowsers}>
          Revoke all
        </button>
      )}
    </div>
  )
}
