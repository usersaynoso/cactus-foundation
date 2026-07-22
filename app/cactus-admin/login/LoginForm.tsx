'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { sanitizeRedirect } from '@/lib/auth/redirect'

type LoginStep = 'passkey' | 'password' | 'otp' | 'totp'
// An account with no passkey can't enrol one from the sign-in page: proving you
// own the account has to come first. The panel just points at the ways in.
type NoPasskeyMode = 'none-found' | null

type LoginFormProps = {
  siteName: string
  faviconUrl: string | null
  faviconDarkUrl: string | null
}

export default function LoginForm({ siteName, faviconUrl, faviconDarkUrl }: LoginFormProps) {
  const searchParams = useSearchParams()
  // Same-origin paths only - a ?next=https://evil.com would otherwise bounce the
  // admin straight off the site the moment they signed in.
  const nextUrl = sanitizeRedirect(searchParams.get('next'), '')
  // Recovery mode is signalled by ?recovery=1 (the token itself now rides in an
  // HttpOnly cookie set by the recovery route, so it never touches the URL).
  // recovery_token is still read for older emailed links already in flight.
  const legacyRecoveryToken = searchParams.get('recovery_token') ?? ''
  const inRecoveryMode = searchParams.get('recovery') === '1' || !!legacyRecoveryToken
  // Set by SessionExpiryWatcher when an open admin tab hits its 24-hour limit, so
  // the login page explains itself rather than looking like a random sign-out.
  const sessionExpired = searchParams.get('expired') === '1'

  const [step, setStep] = useState<LoginStep>('passkey')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [userId, setUserId] = useState('')
  const [otpChannel, setOtpChannel] = useState<'email' | 'sms'>('email')
  const [otpDestination, setOtpDestination] = useState('')
  const [trustDevice, setTrustDevice] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [emailAvailable, setEmailAvailable] = useState(false)
  const [neonProjectId, setNeonProjectId] = useState<string | null>(null)
  const [lostAccessMode, setLostAccessMode] = useState(false)
  const [lostAccessEmail, setLostAccessEmail] = useState('')
  const [lostAccessSent, setLostAccessSent] = useState(false)
  const [noPasskeyMode, setNoPasskeyMode] = useState<NoPasskeyMode>(null)
  const [newPassword, setNewPassword] = useState('')
  const [tokenRecoveryMode] = useState(inRecoveryMode)
  const [showFallback, setShowFallback] = useState(inRecoveryMode)
  const autoPasskeyAttempted = useRef(false)

  useEffect(() => {
    fetch('/api/auth/config').then((r) => r.json()).then((d: { emailConfigured: boolean; neonProjectId: string | null }) => {
      setEmailAvailable(d.emailConfigured)
      setNeonProjectId(d.neonProjectId)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (autoPasskeyAttempted.current || tokenRecoveryMode) return
    autoPasskeyAttempted.current = true
    void handlePasskeyLogin(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount to auto-prompt for a passkey
  }, [])

  function redirect(path?: string) {
    window.location.href = path ?? nextUrl ?? '/'
  }

  async function handlePasskeyLogin(auto = false) {
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
      const opts = await optRes.json() as { noPasskeys?: boolean; allowCredentials?: unknown[] }

      if (opts.noPasskeys) {
        setNoPasskeyMode('none-found')
        setShowFallback(true)
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
      // A cancelled/failed automatic prompt is expected (e.g. Safari blocks
      // WebAuthn without a user gesture) - reveal the other sign-in options
      // without shouting about it.
      const cancelled = err instanceof Error && err.name === 'NotAllowedError'
      if (!(auto && cancelled)) {
        setError(err instanceof Error ? err.message : 'Passkey authentication failed')
      }
      setShowFallback(true)
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
      setOtpChannel(d.channel === 'sms' ? 'sms' : 'email')
      setOtpDestination(d.destination ?? '')
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

  async function handleTotpLogin() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/totp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: totpCode }),
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
      // The token comes from the HttpOnly recovery cookie server-side; only pass
      // it in the body for an older link that still carried it in the URL.
      const body: Record<string, string> = {}
      if (legacyRecoveryToken) body['token'] = legacyRecoveryToken
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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-8)', background: 'var(--color-bg-subtle)' }}>
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-10)', width: '100%', maxWidth: 400, boxShadow: 'var(--shadow-xl)' }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-8)' }}>
          {faviconUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={faviconUrl}
                alt={siteName}
                style={{ width: '2.5rem', height: '2.5rem', marginBottom: 'var(--space-3)' }}
                data-logo-variant={faviconDarkUrl ? 'light' : undefined}
              />
              {faviconDarkUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={faviconDarkUrl}
                  alt={siteName}
                  style={{ width: '2.5rem', height: '2.5rem', marginBottom: 'var(--space-3)' }}
                  data-logo-variant="dark"
                />
              )}
            </>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/cactus.svg" alt="Cactus Foundation" style={{ width: '2.5rem', height: '2.5rem', marginBottom: 'var(--space-3)' }} />
          )}
          <h1 style={{ margin: 0, fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text)', letterSpacing: '-0.02em' }}>Sign in</h1>
        </div>

        {sessionExpired && !error && (
          <div className="alert alert-info">Your session expired, so you were signed out. Sign in to carry on.</div>
        )}

        {error && <div className="alert alert-danger">{error}</div>}

        {/* ── Email recovery token (from recovery email link) ── */}
        {tokenRecoveryMode && (
          <div>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-semibold)', margin: '0 0 var(--space-4)', color: 'var(--color-text)' }}>Account recovery</h2>
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
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-semibold)', margin: '0 0 var(--space-4)', color: 'var(--color-text)' }}>Lost your passkey?</h2>
            <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-secondary)', margin: '0 0 var(--space-4)' }}>
              You&apos;ll need to prove the account is yours before a new passkey can be added. Any of these will do it:
            </p>
            <ol style={{ fontSize: 'var(--text-base)', paddingLeft: 'var(--space-5)', margin: '0 0 var(--space-4)', lineHeight: 1.7, color: 'var(--color-text-secondary)' }}>
              <li>Request a recovery link below, if this site sends email.</li>
              <li>Sign in with your password, or your authenticator app, if you set either up.</li>
            </ol>
            <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-secondary)', margin: '0 0 var(--space-4)' }}>
              Once you&apos;re in, add a fresh passkey from <strong>Account → Security</strong>. Deleting the old passkey row from your{' '}
              <a
                href={neonProjectId ? `https://console.neon.tech/app/projects/${neonProjectId}` : 'https://console.neon.tech'}
                target="_blank"
                rel="noopener noreferrer"
              >
                database
              </a>
              {' '}on its own won&apos;t let you register a new one at sign-in - that door is shut deliberately, since anyone who knew your email address could otherwise walk through it.
            </p>
            {emailAvailable && !lostAccessSent && (
              <>
                <div style={{ borderTop: '1px solid var(--color-border)', margin: 'var(--space-5) 0', paddingTop: 'var(--space-5)' }}>
                  <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-secondary)', margin: '0 0 var(--space-3)' }}>
                    Alternatively, request a recovery email to sign in without a passkey:
                  </p>
                  <div className="field" style={{ margin: '0 0 var(--space-3)' }}>
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
              <div className="alert alert-success" style={{ marginTop: 'var(--space-4)' }}>
                Recovery link sent. Check your inbox.
              </div>
            )}
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: 'var(--space-4)' }} onClick={() => { setLostAccessMode(false); setLostAccessSent(false); setError('') }}>
              Back to sign in
            </button>
          </div>
        )}

        {/* ── No passkey found — prove who you are first, then add one ──
             A passkey is never handed out here. Enrolling one is a change to the
             account, so it happens from Account settings once you're signed in -
             otherwise anyone who knew the email address could attach their own
             authenticator to it and walk in. */}
        {!tokenRecoveryMode && !lostAccessMode && noPasskeyMode === 'none-found' && (
          <div>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-semibold)', margin: '0 0 var(--space-3)', color: 'var(--color-text)' }}>No passkey found</h2>
            <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-secondary)', margin: '0 0 var(--space-6)' }}>
              No passkey is registered for <strong>{email}</strong>. Sign in another way, then add one from Account → Security.
            </p>
            {emailAvailable && (
              lostAccessSent ? (
                <div className="alert alert-success" style={{ marginBottom: 'var(--space-3)' }}>Recovery link sent. Check your inbox.</div>
              ) : (
                <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={loading} onClick={() => handleSendRecoveryEmail(email)}>
                  {loading ? 'Sending…' : 'Send recovery link'}
                </button>
              )
            )}
            {emailAvailable && (
              <button className="btn btn-secondary" style={{ width: '100%', marginTop: 'var(--space-3)' }} onClick={() => { setNoPasskeyMode(null); setStep('password'); setError('') }}>
                Use password instead
              </button>
            )}
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: 'var(--space-2)' }} onClick={() => { setNoPasskeyMode(null); setStep('totp'); setError('') }}>
              Use authenticator app instead
            </button>
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: 'var(--space-2)' }} onClick={() => { setNoPasskeyMode(null); setLostAccessSent(false); setError('') }}>
              Back to sign in
            </button>
          </div>
        )}

        {/* ── Automatic passkey prompt (fires on page load) ── */}
        {!tokenRecoveryMode && !lostAccessMode && noPasskeyMode === null && step === 'passkey' && !showFallback && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-secondary)', margin: '0 0 var(--space-6)' }}>
              🔑 Waiting for your passkey…
            </p>
            <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => { setShowFallback(true); setError('') }}>
              Use another way to sign in
            </button>
          </div>
        )}

        {/* ── Normal login flows ── */}
        {!tokenRecoveryMode && !lostAccessMode && noPasskeyMode === null && step === 'passkey' && showFallback && (
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
            <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={loading} onClick={() => handlePasskeyLogin()}>
              {loading ? 'Waiting for passkey…' : '🔑 Sign in with passkey'}
            </button>
            {emailAvailable && (
              <button className="btn btn-secondary" style={{ width: '100%', marginTop: 'var(--space-3)' }} onClick={() => setStep('password')}>
                Use password instead
              </button>
            )}
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: 'var(--space-2)' }} onClick={() => { setStep('totp'); setError('') }}>
              Use authenticator app instead
            </button>
            <div style={{ textAlign: 'center', marginTop: 'var(--space-4)' }}>
              <button
                className="btn btn-link"
                style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}
                onClick={() => { setLostAccessMode(true); setError('') }}
              >
                Lost access?
              </button>
            </div>
          </div>
        )}

        {!tokenRecoveryMode && !lostAccessMode && noPasskeyMode === null && step === 'totp' && (
          <div>
            <div className="field">
              <label>Email address</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <div className="field">
              <label>Authenticator code</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(e) => { if (e.key === 'Enter' && email && totpCode.length === 6 && !loading) handleTotpLogin() }}
                placeholder="000000"
                autoFocus
              />
            </div>
            <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={!email || totpCode.length !== 6 || loading} onClick={handleTotpLogin}>
              {loading ? 'Verifying…' : 'Sign in'}
            </button>
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: 'var(--space-2)' }} onClick={() => { setStep('passkey'); setError('') }}>
              Use passkey instead
            </button>
            <div style={{ textAlign: 'center', marginTop: 'var(--space-4)' }}>
              <button
                className="btn btn-link"
                style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}
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
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: 'var(--space-2)' }} onClick={() => { setStep('passkey'); setError('') }}>
              Use passkey instead
            </button>
            <div style={{ textAlign: 'center', marginTop: 'var(--space-4)' }}>
              <button
                className="btn btn-link"
                style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}
                onClick={() => { setLostAccessMode(true); setError('') }}
              >
                Lost access?
              </button>
            </div>
          </div>
        )}

        {!tokenRecoveryMode && !lostAccessMode && noPasskeyMode === null && step === 'otp' && (
          <div>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-base)', margin: '0 0 var(--space-5)' }}>
              {otpChannel === 'sms'
                ? <>We sent a 6-digit code by text message to <strong>{otpDestination || 'your phone'}</strong>. Enter it below.</>
                : <>We sent a 6-digit code to <strong>{email}</strong>. Enter it below.</>}
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
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-base)', marginBottom: 'var(--space-5)', cursor: 'pointer', color: 'var(--color-text)' }}>
              <input type="checkbox" checked={trustDevice} onChange={(e) => setTrustDevice(e.target.checked)} style={{ accentColor: 'var(--color-primary)' }} />
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
