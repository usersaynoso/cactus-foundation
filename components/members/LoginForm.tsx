'use client'

import { useEffect, useState } from 'react'

type Step = 'email' | 'no-passkey' | 'magic-sent' | 'consuming' | 'password' | '2fa' | 'recovery-code'
type TwoFactorMethod = 'EMAIL' | 'AUTHENTICATOR_APP' | 'SMS'

type Props = {
  redirectTo: string
  magicToken?: string
}

export default function LoginForm({ redirectTo, magicToken }: Props) {
  const [step, setStep] = useState<Step>(magicToken ? 'consuming' : 'email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [trustBrowser, setTrustBrowser] = useState(false)
  const [memberId, setMemberId] = useState('')
  const [twoFactorMethod, setTwoFactorMethod] = useState<TwoFactorMethod>('EMAIL')
  const [twoFactorDestination, setTwoFactorDestination] = useState('')
  const [passwordsEnabled, setPasswordsEnabled] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/members/auth/config')
      .then((r) => r.json())
      .then((d: { passwordsEnabled: boolean }) => setPasswordsEnabled(d.passwordsEnabled))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!magicToken) return
    fetch('/api/members/auth/magic-link/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: magicToken }),
    })
      .then(async (res) => {
        const d = await res.json()
        if (!res.ok) {
          if (d.redirectToVerify) {
            window.location.href = `verify-email?email=${encodeURIComponent(d.email ?? '')}`
            return
          }
          throw new Error(d.error ?? 'This sign-in link is invalid or has expired')
        }
        window.location.href = redirectTo
      })
      .catch((err: unknown) => {
        setStep('email')
        setError(err instanceof Error ? err.message : 'This sign-in link is invalid or has expired')
      })
    // Runs once against the token embedded in the current URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redirectTo/magicToken are stable for the page's lifetime
  }, [])

  function handleRedirectToVerify(emailForVerify: string) {
    window.location.href = `verify-email?email=${encodeURIComponent(emailForVerify)}`
  }

  // When the site requires a mobile number for sign-in codes and this member
  // hasn't added one yet, land them on the account overview (where the
  // enrolment card lives) instead of wherever they were headed.
  function finishLogin(smsEnrolmentRequired?: boolean) {
    window.location.href = smsEnrolmentRequired
      ? window.location.pathname.replace(/\/login$/, '') || '/'
      : redirectTo
  }

  async function handlePasskeyLogin() {
    setError('')
    setLoading(true)
    try {
      const { startAuthentication } = await import('@simplewebauthn/browser')

      const optRes = await fetch('/api/members/auth/passkey/authenticate-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(email ? { email } : {}),
      })
      const opts = await optRes.json()
      if (!optRes.ok) throw new Error(opts.error ?? 'Failed to start passkey sign-in')
      if (opts.noPasskeys) {
        setStep('no-passkey')
        return
      }

      const assertion = await startAuthentication({ optionsJSON: opts })

      const verifyRes = await fetch('/api/members/auth/passkey/authenticate-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assertion),
      })
      const d = await verifyRes.json()
      if (!verifyRes.ok) {
        if (d.redirectToVerify) return handleRedirectToVerify(email)
        throw new Error(d.error ?? 'Sign-in failed')
      }
      window.location.href = redirectTo
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Passkey sign-in failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleMagicLink() {
    setError('')
    setLoading(true)
    try {
      await fetch('/api/members/auth/magic-link/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setStep('magic-sent')
    } catch {
      setError('Failed to send sign-in link')
    } finally {
      setLoading(false)
    }
  }

  async function handlePasswordSubmit() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/members/auth/password/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const d = await res.json()
      if (!res.ok) {
        if (d.redirectToVerify) return handleRedirectToVerify(email)
        throw new Error(d.error ?? 'Sign-in failed')
      }
      if (d.step === 'done') {
        finishLogin(d.smsEnrolmentRequired)
        return
      }
      setMemberId(d.memberId)
      setTwoFactorMethod(d.method)
      setTwoFactorDestination(d.destination ?? '')
      setStep('2fa')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleTwoFactorSubmit() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/members/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, code, trustBrowser }),
      })
      const d = await res.json()
      if (!res.ok) {
        if (d.redirectToVerify) return handleRedirectToVerify(email)
        throw new Error(d.error ?? 'Verification failed')
      }
      finishLogin(d.smsEnrolmentRequired)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleRecoveryCodeSubmit() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/members/auth/recovery-code/consume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, code }),
      })
      const d = await res.json()
      if (!res.ok) {
        if (d.redirectToVerify) return handleRedirectToVerify(email)
        throw new Error(d.error ?? 'Invalid recovery code')
      }
      window.location.href = redirectTo
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid recovery code')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'consuming') {
    return <p style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>Signing you in…</p>
  }

  if (step === 'magic-sent') {
    return (
      <div className="alert alert-success">
        Check <strong>{email}</strong> for a sign-in link. It expires in 15 minutes.
      </div>
    )
  }

  const heading = (
    <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-semibold)', margin: '0 0 var(--space-5)', color: 'var(--color-text)' }}>
      Sign in
    </h1>
  )

  if (step === '2fa') {
    return (
      <div>
        {heading}
        {error && <div className="alert alert-danger">{error}</div>}
        {twoFactorMethod === 'SMS' && (
          <p className="field-hint" style={{ marginBottom: 'var(--space-3)' }}>
            We&apos;ve sent a code by text message{twoFactorDestination ? ` to ${twoFactorDestination}` : ''}.
          </p>
        )}
        <div className="field">
          <label>{twoFactorMethod === 'EMAIL' ? 'Email code' : twoFactorMethod === 'SMS' ? 'Text message code' : 'Authenticator code'}</label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={(e) => { if (e.key === 'Enter' && code.length === 6 && !loading) handleTwoFactorSubmit() }}
            placeholder="000000"
            autoFocus
          />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-5)', cursor: 'pointer', color: 'var(--color-text)' }}>
          <input type="checkbox" checked={trustBrowser} onChange={(e) => setTrustBrowser(e.target.checked)} />
          Trust this browser
        </label>
        <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={code.length !== 6 || loading} onClick={handleTwoFactorSubmit}>
          {loading ? 'Verifying…' : 'Sign in'}
        </button>
        <button className="btn btn-link" style={{ marginTop: 'var(--space-3)' }} onClick={() => { setStep('recovery-code'); setCode(''); setError('') }}>
          Use a recovery code instead
        </button>
      </div>
    )
  }

  if (step === 'recovery-code') {
    return (
      <div>
        {heading}
        {error && <div className="alert alert-danger">{error}</div>}
        <div className="field">
          <label>Recovery code</label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && code && !loading) handleRecoveryCodeSubmit() }}
            placeholder="xxxxxx-xxxxxx"
            autoFocus
          />
        </div>
        <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={!code || loading} onClick={handleRecoveryCodeSubmit}>
          {loading ? 'Verifying…' : 'Sign in'}
        </button>
        <button className="btn btn-secondary" style={{ width: '100%', marginTop: 'var(--space-2)' }} onClick={() => { setStep('2fa'); setCode(''); setError('') }}>
          Back
        </button>
      </div>
    )
  }

  if (step === 'password') {
    return (
      <div>
        {heading}
        {error && <div className="alert alert-danger">{error}</div>}
        <div className="field">
          <label>Email address</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && email && password && !loading) handlePasswordSubmit() }}
            autoComplete="current-password"
          />
        </div>
        <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={!email || !password || loading} onClick={handlePasswordSubmit}>
          {loading ? 'Signing in…' : 'Continue'}
        </button>
        <button className="btn btn-secondary" style={{ width: '100%', marginTop: 'var(--space-2)' }} onClick={() => { setStep('email'); setError('') }}>
          Back
        </button>
      </div>
    )
  }

  return (
    <div>
      {heading}

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="field">
        <label>Email address</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && email && !loading) handlePasskeyLogin() }}
          autoComplete="email"
          autoFocus
        />
      </div>

      {step === 'no-passkey' && (
        <p className="field-hint" style={{ marginBottom: 'var(--space-3)' }}>
          No passkey found for this email. Use a sign-in link instead.
        </p>
      )}

      <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={!email || loading} onClick={handlePasskeyLogin}>
        {loading ? 'Waiting for passkey…' : '🔑 Sign in with passkey'}
      </button>
      <button
        className="btn btn-secondary"
        style={{ width: '100%', marginTop: 'var(--space-3)' }}
        disabled={!email || loading}
        onClick={handleMagicLink}
      >
        Email me a sign-in link
      </button>
      {passwordsEnabled && (
        <button
          className="btn btn-link"
          style={{ marginTop: 'var(--space-3)' }}
          onClick={() => { setStep('password'); setError('') }}
        >
          Use password instead
        </button>
      )}
    </div>
  )
}
