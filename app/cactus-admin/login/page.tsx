'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

type LoginStep = 'passkey' | 'password' | 'otp'
type NoPasskeyMode = 'register' | 'email' | null

export default function LoginPage() {
  const searchParams = useSearchParams()
  const nextUrl = searchParams.get('next') ?? ''
  const recoveryToken = searchParams.get('recovery_token') ?? ''

  const [step, setStep] = useState<LoginStep>('passkey')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [userId, setUserId] = useState('')
  const [trustDevice, setTrustDevice] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [emailAvailable, setEmailAvailable] = useState(false)
  const [neonProjectId, setNeonProjectId] = useState<string | null>(null)
  const [lostAccessMode, setLostAccessMode] = useState(false)
  const [lostAccessEmail, setLostAccessEmail] = useState('')
  const [lostAccessSent, setLostAccessSent] = useState(false)
  const [noPasskeyMode, setNoPasskeyMode] = useState<NoPasskeyMode>(null)
  const [noPasskeyUserId, setNoPasskeyUserId] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [tokenRecoveryMode] = useState(!!recoveryToken)

  useEffect(() => {
    fetch('/api/auth/config').then((r) => r.json()).then((d: { emailConfigured: boolean; neonProjectId: string | null }) => {
      setEmailAvailable(d.emailConfigured)
      setNeonProjectId(d.neonProjectId)
    }).catch(() => {})
  }, [])

  function redirect(path?: string) {
    window.location.href = path ?? nextUrl ?? '/'
  }

  async function handlePasskeyLogin() {
    setError('')
    setLoading(true)
    try {
      const { startAuthentication } = await import('@simplewebauthn/browser')

      const optRes = await fetch('/api/auth/passkey/authenticate-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(email ? { email } : {}),
      })
      if (!optRes.ok) {
        const d = await optRes.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error ?? 'Failed to get authentication options')
      }
      const opts = await optRes.json() as { noPasskeys?: boolean; userId?: string; allowCredentials?: unknown[] }

      if (opts.noPasskeys) {
        setNoPasskeyUserId(opts.userId ?? '')
        setNoPasskeyMode(emailAvailable ? 'email' : 'register')
        return
      }

      const assertion = await startAuthentication({ optionsJSON: opts as Parameters<typeof startAuthentication>[0]['optionsJSON'] })

      const verifyRes = await fetch('/api/auth/passkey/authenticate-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assertion),
      })
      if (!verifyRes.ok) {
        const d = await verifyRes.json()
        throw new Error(d.error ?? 'Authentication failed')
      }

      const parts = window.location.pathname.split('/')
      const ap = parts[1] ?? ''
      redirect(nextUrl || `/${ap}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Passkey authentication failed')
    } finally {
      setLoading(false)
    }
  }

  async function handlePasswordLogin() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Login failed')
      setUserId(d.userId)
      setStep('otp')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleOtp() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/email-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, code: otp, trustDevice }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Verification failed')
      const parts = window.location.pathname.split('/')
      const ap = parts[1] ?? ''
      redirect(nextUrl || `/${ap}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleTokenRecovery() {
    setError('')
    setLoading(true)
    try {
      const body: Record<string, string> = { token: recoveryToken }
      if (newPassword) body['newPassword'] = newPassword

      const res = await fetch('/api/auth/recovery/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Recovery failed')
      const parts = window.location.pathname.split('/')
      const ap = parts[1] ?? ''
      redirect(`/${ap}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Recovery failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleRegisterNewPasskey() {
    setError('')
    setLoading(true)
    try {
      const { startRegistration } = await import('@simplewebauthn/browser')

      const optRes = await fetch('/api/auth/passkey/register-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: noPasskeyUserId }),
      })
      if (!optRes.ok) {
        const d = await optRes.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error ?? 'Failed to get registration options')
      }
      const opts = await optRes.json()
      const attestation = await startRegistration({ optionsJSON: opts })

      const verifyRes = await fetch('/api/auth/passkey/register-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: noPasskeyUserId, attestation }),
      })
      if (!verifyRes.ok) {
        const d = await verifyRes.json()
        throw new Error(d.error ?? 'Passkey registration failed')
      }

      const parts = window.location.pathname.split('/')
      const ap = parts[1] ?? ''
      redirect(nextUrl || `/${ap}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Passkey registration failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleSendRecoveryEmail(emailAddress: string) {
    setError('')
    setLoading(true)
    try {
      await fetch('/api/auth/recovery/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailAddress }),
      })
      setLostAccessSent(true)
    } catch {
      setError('Failed to send recovery email')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: '#f9fafb' }}>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '2.5rem', width: '100%', maxWidth: 400, boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cactus.svg" alt="Cactus" style={{ width: '2.5rem', height: '2.5rem', marginBottom: '0.5rem' }} />
          <h1 style={{ margin: 0, fontSize: '1.375rem', fontWeight: 700 }}>Sign in</h1>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        {/* ── Email recovery token (from recovery email link) ── */}
        {tokenRecoveryMode && (
          <div>
            <h2 style={{ fontSize: '1rem', margin: '0 0 1rem' }}>Account recovery</h2>
            <div className="field">
              <label>New password (optional)</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Leave blank to skip" />
              <span className="field-hint">You can add a passkey after signing in.</span>
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading} onClick={handleTokenRecovery}>
              {loading ? 'Recovering…' : 'Complete recovery'}
            </button>
          </div>
        )}

        {/* ── Lost access instructions ── */}
        {!tokenRecoveryMode && lostAccessMode && (
          <div>
            <h2 style={{ fontSize: '1rem', margin: '0 0 1rem' }}>Lost your passkey?</h2>
            <p style={{ fontSize: '0.9375rem', color: 'var(--color-muted)', margin: '0 0 1rem' }}>
              Remove your passkey record directly from your Neon database, then return here to register a new one.
            </p>
            <ol style={{ fontSize: '0.9375rem', paddingLeft: '1.25rem', margin: '0 0 1rem', lineHeight: 1.7 }}>
              <li>
                Open your{' '}
                <a
                  href={neonProjectId ? `https://console.neon.tech/app/projects/${neonProjectId}` : 'https://console.neon.tech'}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Neon database
                </a>
                {' '}and go to <strong>Tables</strong> in the left sidebar.
              </li>
              <li>Select the <strong>Passkey</strong> table.</li>
              <li>Click the checkbox next to your passkey entry to select it, then click <strong>Delete 1 record</strong> and confirm.</li>
              <li>Return here and sign in with your email address and you&apos;ll be prompted to register a new passkey.</li>
            </ol>
            {emailAvailable && !lostAccessSent && (
              <>
                <div style={{ borderTop: '1px solid var(--color-border)', margin: '1.25rem 0', paddingTop: '1.25rem' }}>
                  <p style={{ fontSize: '0.9375rem', color: 'var(--color-muted)', margin: '0 0 0.75rem' }}>
                    Alternatively, request a recovery email to sign in without a passkey:
                  </p>
                  <div className="field" style={{ margin: '0 0 0.75rem' }}>
                    <input
                      type="email"
                      value={lostAccessEmail}
                      onChange={(e) => setLostAccessEmail(e.target.value)}
                      placeholder="your@email.com"
                      autoComplete="email"
                    />
                  </div>
                  <button
                    className="btn btn-secondary"
                    style={{ width: '100%' }}
                    disabled={!lostAccessEmail || loading}
                    onClick={() => handleSendRecoveryEmail(lostAccessEmail)}
                  >
                    {loading ? 'Sending…' : 'Send recovery link'}
                  </button>
                </div>
              </>
            )}
            {lostAccessSent && (
              <div className="alert alert-success" style={{ marginTop: '1rem' }}>
                Recovery link sent. Check your inbox.
              </div>
            )}
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: '1rem' }} onClick={() => { setLostAccessMode(false); setLostAccessSent(false); setError('') }}>
              Back to sign in
            </button>
          </div>
        )}

        {/* ── No passkey found — register new one ── */}
        {!tokenRecoveryMode && !lostAccessMode && noPasskeyMode === 'register' && (
          <div>
            <h2 style={{ fontSize: '1rem', margin: '0 0 0.75rem' }}>No passkey found</h2>
            <p style={{ fontSize: '0.9375rem', color: 'var(--color-muted)', margin: '0 0 1.5rem' }}>
              No passkey is registered for <strong>{email}</strong>. Register a new one now to sign in.
            </p>
            <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={loading} onClick={handleRegisterNewPasskey}>
              {loading ? 'Registering…' : '🔑 Register new passkey →'}
            </button>
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: '0.5rem' }} onClick={() => { setNoPasskeyMode(null); setError('') }}>
              Back to sign in
            </button>
          </div>
        )}

        {/* ── No passkey found — send recovery email ── */}
        {!tokenRecoveryMode && !lostAccessMode && noPasskeyMode === 'email' && (
          <div>
            <h2 style={{ fontSize: '1rem', margin: '0 0 0.75rem' }}>No passkey found</h2>
            {!lostAccessSent ? (
              <>
                <p style={{ fontSize: '0.9375rem', color: 'var(--color-muted)', margin: '0 0 1.5rem' }}>
                  No passkey is registered for <strong>{email}</strong>. We can send a recovery link to your email address.
                </p>
                <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={loading} onClick={() => handleSendRecoveryEmail(email)}>
                  {loading ? 'Sending…' : 'Send recovery link'}
                </button>
              </>
            ) : (
              <div className="alert alert-success">Recovery link sent. Check your inbox.</div>
            )}
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: '0.5rem' }} onClick={() => { setNoPasskeyMode(null); setLostAccessSent(false); setError('') }}>
              Back to sign in
            </button>
          </div>
        )}

        {/* ── Normal login flows ── */}
        {!tokenRecoveryMode && !lostAccessMode && noPasskeyMode === null && step === 'passkey' && (
          <div>
            <div className="field">
              <label>Email address (optional)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !loading) handlePasskeyLogin() }}
                placeholder="Helps identify your passkey"
                autoComplete="email"
              />
            </div>
            <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={loading} onClick={handlePasskeyLogin}>
              {loading ? 'Waiting for passkey…' : '🔑 Sign in with passkey'}
            </button>
            {emailAvailable && (
              <button className="btn btn-secondary" style={{ width: '100%', marginTop: '0.75rem' }} onClick={() => setStep('password')}>
                Use password instead
              </button>
            )}
            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              <button
                style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '0.875rem', cursor: 'pointer', padding: 0 }}
                onClick={() => { setLostAccessMode(true); setError('') }}
              >
                Lost access?
              </button>
            </div>
          </div>
        )}

        {!tokenRecoveryMode && !lostAccessMode && noPasskeyMode === null && step === 'password' && (
          <div>
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
                onKeyDown={(e) => { if (e.key === 'Enter' && email && password && !loading) handlePasswordLogin() }}
                autoComplete="current-password"
              />
            </div>
            <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={!email || !password || loading} onClick={handlePasswordLogin}>
              {loading ? 'Signing in…' : 'Continue →'}
            </button>
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: '0.5rem' }} onClick={() => { setStep('passkey'); setError('') }}>
              Use passkey instead
            </button>
            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              <button
                style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '0.875rem', cursor: 'pointer', padding: 0 }}
                onClick={() => { setLostAccessMode(true); setError('') }}
              >
                Lost access?
              </button>
            </div>
          </div>
        )}

        {!tokenRecoveryMode && !lostAccessMode && noPasskeyMode === null && step === 'otp' && (
          <div>
            <p style={{ color: '#6b7280', fontSize: '0.9375rem', margin: '0 0 1.25rem' }}>
              We sent a 6-digit code to <strong>{email}</strong>. Enter it below.
            </p>
            <div className="field">
              <label>Verification code</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(e) => { if (e.key === 'Enter' && otp.length === 6 && !loading) handleOtp() }}
                placeholder="000000"
                autoFocus
              />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9375rem', marginBottom: '1.25rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={trustDevice} onChange={(e) => setTrustDevice(e.target.checked)} />
              Trust this browser for 28 days
            </label>
            <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={otp.length !== 6 || loading} onClick={handleOtp}>
              {loading ? 'Verifying…' : 'Sign in'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
