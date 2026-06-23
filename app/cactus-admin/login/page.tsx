'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { isEmailConfigured } from '@/lib/config/env'
import type { Metadata } from 'next'

// Note: metadata must be in a server component; for client components wrap with Suspense
// or use a separate server layout. Here we skip metadata since layout handles robots.

type LoginStep = 'passkey' | 'password' | 'otp'

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
  const [recoveryMode, setRecoveryMode] = useState(!!recoveryToken)
  const [recoveryCode, setRecoveryCode] = useState('')
  const [newPassword, setNewPassword] = useState('')

  useEffect(() => {
    // Check if email/password login is available
    fetch('/api/auth/config').then((r) => r.json()).then((d: { emailConfigured: boolean }) => {
      setEmailAvailable(d.emailConfigured)
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
      const opts = await optRes.json()
      const assertion = await startAuthentication({ optionsJSON: opts })

      const verifyRes = await fetch('/api/auth/passkey/authenticate-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assertion),
      })
      if (!verifyRes.ok) {
        const d = await verifyRes.json()
        throw new Error(d.error ?? 'Authentication failed')
      }

      // Determine admin path from URL
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

  async function handleRecovery() {
    setError('')
    setLoading(true)
    try {
      const body: Record<string, string> = {}
      if (recoveryToken) {
        body['token'] = recoveryToken
      } else {
        body['recoveryCode'] = recoveryCode
        body['email'] = email
      }
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

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: '#f9fafb' }}>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '2.5rem', width: '100%', maxWidth: 400, boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🌵</div>
          <h1 style={{ margin: 0, fontSize: '1.375rem', fontWeight: 700 }}>Sign in</h1>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        {recoveryMode && (
          <div>
            <h2 style={{ fontSize: '1rem', margin: '0 0 1rem' }}>Account recovery</h2>
            {!recoveryToken && (
              <>
                <div className="field">
                  <label>Email address</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="field">
                  <label>Recovery code</label>
                  <input type="text" value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value)} placeholder="Your offline recovery code" />
                </div>
              </>
            )}
            <div className="field">
              <label>New password (optional)</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Leave blank to skip" />
              <span className="field-hint">You can add a passkey after signing in.</span>
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading} onClick={handleRecovery}>
              {loading ? 'Recovering…' : 'Complete recovery'}
            </button>
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: '0.5rem' }} onClick={() => { setRecoveryMode(false); setError('') }}>
              Back to sign in
            </button>
          </div>
        )}

        {!recoveryMode && step === 'passkey' && (
          <div>
            <div className="field">
              <label>Email address (optional)</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Helps identify your passkey" autoComplete="email" />
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
                onClick={() => { setRecoveryMode(true); setError('') }}
              >
                Lost access?
              </button>
            </div>
          </div>
        )}

        {!recoveryMode && step === 'password' && (
          <div>
            <div className="field">
              <label>Email address</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
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
                onClick={() => { setRecoveryMode(true); setError('') }}
              >
                Lost access?
              </button>
            </div>
          </div>
        )}

        {!recoveryMode && step === 'otp' && (
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
