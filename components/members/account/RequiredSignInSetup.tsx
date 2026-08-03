'use client'

import { useCallback, useEffect, useState } from 'react'

// Which of the enrolable sign-in methods this site insists on. The list of what
// is still *outstanding* is worked out here from live account status rather
// than passed in, so finishing one step updates the page without a reload.
type RequiredMethod = 'PASSKEY' | 'PASSWORD'

type Props = {
  requiredMethods: RequiredMethod[]
  basePath: string
  // Email codes are the gentlest second step, but only when the site can
  // actually send email. Without it the authenticator app is the only offer.
  emailCodesAvailable: boolean
}

type Status = { hasPasskey: boolean; hasPassword: boolean; hasTwoFactor: boolean }

export default function RequiredSignInSetup({ requiredMethods, basePath, emailCodesAvailable }: Props) {
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [password, setPassword] = useState('')
  const [twoFactorMethod, setTwoFactorMethod] = useState<'EMAIL' | 'AUTHENTICATOR_APP' | null>(null)
  const [totpSetup, setTotpSetup] = useState<{ qrDataUrl: string; secret: string } | null>(null)
  const [code, setCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)

  // Written as a promise chain rather than async/await so the state update sits
  // in a callback: react-hooks/set-state-in-effect reads a setState after an
  // await as a synchronous one, and the mount effect below calls this.
  const refresh = useCallback(
    () =>
      Promise.all([
        fetch('/api/members/passkeys').then((r) => r.json()),
        fetch('/api/members/password').then((r) => r.json()),
      ]).then(([passkeys, passwordStatus]) => {
        setStatus({
          hasPasskey: (passkeys.passkeys?.length ?? 0) > 0,
          hasPassword: Boolean(passwordStatus.hasPassword),
          hasTwoFactor: Boolean(passwordStatus.hasTwoFactor),
        })
      }),
    []
  )

  useEffect(() => {
    refresh().catch(() => setError('Could not load your account details. Please reload the page.'))
  }, [refresh])

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
      await refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add passkey')
    } finally {
      setBusy(false)
    }
  }

  async function savePassword() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/members/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: password }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to save password')
      setPassword('')
      await refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save password')
    } finally {
      setBusy(false)
    }
  }

  async function startTwoFactor(method: 'EMAIL' | 'AUTHENTICATOR_APP') {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/members/2fa/setup-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not start setup')
      setTwoFactorMethod(method)
      setTotpSetup(method === 'AUTHENTICATOR_APP' ? { qrDataUrl: d.qrDataUrl, secret: d.secret } : null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not start setup')
    } finally {
      setBusy(false)
    }
  }

  async function verifyTwoFactor() {
    if (!twoFactorMethod) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/members/2fa/setup-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: twoFactorMethod, code }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Incorrect or expired code')
      setCode('')
      setTotpSetup(null)
      setTwoFactorMethod(null)
      // One-time codes, shown once. They are why finishing here is a button
      // rather than an automatic bounce back to the account.
      if (d.recoveryCodes) setRecoveryCodes(d.recoveryCodes)
      await refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Incorrect or expired code')
    } finally {
      setBusy(false)
    }
  }

  const heading = (
    <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-semibold)', margin: '0 0 var(--space-2)', color: 'var(--color-text)' }}>
      Finish setting up your sign-in
    </h1>
  )

  if (!status) {
    return (
      <div>
        {heading}
        <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
      </div>
    )
  }

  const needsPasskey = requiredMethods.includes('PASSKEY') && !status.hasPasskey
  const needsPassword = requiredMethods.includes('PASSWORD') && !status.hasPassword
  const needsTwoFactor = requiredMethods.includes('PASSWORD') && !status.hasTwoFactor
  const allDone = !needsPasskey && !needsPassword && !needsTwoFactor

  return (
    <div style={{ maxWidth: 520 }}>
      {heading}
      <p style={{ color: 'var(--color-text-muted)', margin: '0 0 var(--space-5)' }}>
        {allDone
          ? 'All done. Your account is ready to use.'
          : 'This site asks every member for the following before you carry on. It only takes a moment.'}
      </p>

      {error && <div className="alert alert-danger">{error}</div>}

      {recoveryCodes && (
        <div className="alert alert-success">
          <p style={{ margin: '0 0 var(--space-2)', fontWeight: 600 }}>
            Save these recovery codes somewhere safe - each can be used once if you ever lose your second step:
          </p>
          <pre style={{ margin: 0, fontFamily: 'var(--font-mono, monospace)' }}>{recoveryCodes.join('\n')}</pre>
        </div>
      )}

      {needsPasskey && (
        <section style={{ marginBottom: 'var(--space-6)' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: '0 0 var(--space-2)', color: 'var(--color-text)' }}>
            Add a passkey
          </h2>
          <p className="field-hint" style={{ margin: '0 0 var(--space-3)' }}>
            Your device unlocks it with a fingerprint, your face, or its own screen lock. Nothing to remember,
            nothing to type.
          </p>
          <button className="btn btn-primary" disabled={busy} onClick={addPasskey}>
            🔑 Add a passkey
          </button>
        </section>
      )}

      {needsPassword && (
        <section style={{ marginBottom: 'var(--space-6)' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: '0 0 var(--space-2)', color: 'var(--color-text)' }}>
            Set a password
          </h2>
          <div className="field">
            <label>New password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <button className="btn btn-primary" disabled={busy || !password} onClick={savePassword}>
            Save password
          </button>
        </section>
      )}

      {/* Only once a password exists: a second step is what makes it usable, and
          asking for one before there is anything to protect reads as busywork. */}
      {!needsPassword && needsTwoFactor && (
        <section style={{ marginBottom: 'var(--space-6)' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: '0 0 var(--space-2)', color: 'var(--color-text)' }}>
            Add your second step
          </h2>
          <p className="field-hint" style={{ margin: '0 0 var(--space-3)' }}>
            Signing in with a password also needs a short code, so a stolen password on its own gets nobody
            anywhere.
          </p>

          {twoFactorMethod === null ? (
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              {emailCodesAvailable && (
                <button className="btn btn-primary" disabled={busy} onClick={() => startTwoFactor('EMAIL')}>
                  Email me the codes
                </button>
              )}
              <button
                className={emailCodesAvailable ? 'btn btn-secondary' : 'btn btn-primary'}
                disabled={busy}
                onClick={() => startTwoFactor('AUTHENTICATOR_APP')}
              >
                Use an authenticator app
              </button>
            </div>
          ) : (
            <div>
              {totpSetup && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element -- data: URI generated per request, nothing for the image optimiser to do */}
                  <img src={totpSetup.qrDataUrl} alt="Authenticator QR code" style={{ width: 180, height: 180 }} />
                  <p className="field-hint">Or type this in by hand: {totpSetup.secret}</p>
                </>
              )}
              <div className="field">
                <label>{twoFactorMethod === 'EMAIL' ? 'The 6-digit code we just emailed you' : 'The 6-digit code from your app'}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => { if (e.key === 'Enter' && code.length === 6 && !busy) verifyTwoFactor() }}
                  placeholder="000000"
                  autoFocus
                />
              </div>
              <button className="btn btn-primary" disabled={busy || code.length !== 6} onClick={verifyTwoFactor}>
                Confirm
              </button>
              <button
                className="btn btn-link"
                style={{ marginLeft: 'var(--space-2)' }}
                disabled={busy}
                onClick={() => { setTwoFactorMethod(null); setTotpSetup(null); setCode(''); setError('') }}
              >
                Choose a different way
              </button>
            </div>
          )}
        </section>
      )}

      {allDone && (
        <a className="btn btn-primary btn-lg" href={basePath}>
          Continue to your account
        </a>
      )}

      {!allDone && (
        <p className="field-hint" style={{ marginTop: 'var(--space-6)' }}>
          Not now?{' '}
          <button
            className="btn btn-link"
            onClick={() => {
              fetch('/api/members/auth/logout', { method: 'POST' }).finally(() => {
                window.location.href = `${basePath}/login`
              })
            }}
          >
            Sign out
          </button>{' '}
          - you can pick this up next time you sign in.
        </p>
      )}
    </div>
  )
}
