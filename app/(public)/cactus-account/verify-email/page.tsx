'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

type State = 'checking' | 'success' | 'error' | 'pending'

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  )
}

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const emailParam = searchParams.get('email') ?? ''

  const [state, setState] = useState<State>(token ? 'checking' : 'pending')
  const [message, setMessage] = useState('')
  const [resendEmail, setResendEmail] = useState(emailParam)
  const [resent, setResent] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  useEffect(() => {
    if (!token) return
    fetch('/api/members/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const d = await res.json()
        if (!res.ok) throw new Error(d.error ?? 'Verification failed')
        setState('success')
        setMessage(
          d.status === 'PENDING_APPROVAL'
            ? 'Your email is verified. Your account is now awaiting admin approval.'
            : 'Your email is verified. You can now sign in.'
        )
      })
      .catch((err: unknown) => {
        setState('error')
        setMessage(err instanceof Error ? err.message : 'Verification failed')
      })
  }, [token])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  async function handleResend() {
    if (!resendEmail || resendCooldown > 0) return
    await fetch('/api/members/verify-email/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resendEmail }),
    }).catch(() => {})
    setResent(true)
    setResendCooldown(60)
  }

  return (
    <div style={{ maxWidth: 440, margin: '4rem auto', padding: '0 1.5rem', textAlign: 'center' }}>
      {state === 'checking' && <p style={{ color: 'var(--color-text-muted)' }}>Verifying your email…</p>}

      {state === 'success' && <div className="alert alert-success">{message}</div>}

      {state === 'error' && (
        <>
          <div className="alert alert-danger">{message}</div>
          <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-4)' }}>
            Request a new link below.
          </p>
        </>
      )}

      {(state === 'pending' || state === 'error') && (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            Check your inbox for a verification link. Didn&apos;t get it?
          </p>
          <div className="field" style={{ maxWidth: 320, margin: '0 auto var(--space-3)' }}>
            <input
              type="email"
              value={resendEmail}
              onChange={(e) => setResendEmail(e.target.value)}
              placeholder="your@email.com"
              autoComplete="email"
            />
          </div>
          <button className="btn btn-secondary" disabled={!resendEmail || resendCooldown > 0} onClick={handleResend}>
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : resent ? 'Resend link' : 'Send verification link'}
          </button>
        </div>
      )}
    </div>
  )
}
