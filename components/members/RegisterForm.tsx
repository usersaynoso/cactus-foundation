'use client'

import { useEffect, useState } from 'react'
import TurnstileWidget from '@/components/members/TurnstileWidget'
import type { MembersConfig } from '@/lib/members/config'

type Props = {
  registrationMode: MembersConfig['registrationMode']
  inviteToken?: string
  privacyPolicyUrl?: string
}

type RegisterResult = { status: string; verifyEmailRequired: boolean }

export default function RegisterForm({ registrationMode, inviteToken, privacyPolicyUrl }: Props) {
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [agreedToPolicy, setAgreedToPolicy] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<RegisterResult | null>(null)

  useEffect(() => {
    fetch('/api/auth/config')
      .then((r) => r.json())
      .then((d: { turnstileSiteKey: string | null }) => setTurnstileSiteKey(d.turnstileSiteKey))
      .catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/members/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          username,
          displayName: displayName || undefined,
          agreedToPolicy,
          turnstileToken: turnstileToken || undefined,
          inviteToken,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Registration failed')

      const registerResult = d as RegisterResult
      setResult(registerResult)
      if (registerResult.verifyEmailRequired) {
        const target = window.location.pathname.replace(/\/register$/, '/verify-email')
        window.location.href = `${target}?email=${encodeURIComponent(email)}`
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  if (result && !result.verifyEmailRequired) {
    return (
      <div className="alert alert-success">
        {result.status === 'PENDING_APPROVAL'
          ? "Account created. It's now awaiting admin approval before you can sign in."
          : 'Account created. You can now sign in.'}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-semibold)', margin: '0 0 var(--space-5)', color: 'var(--color-text)' }}>
        Create an account
      </h1>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="field">
        <label>Email address</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      </div>

      <div className="field">
        <label>Username</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          required
          pattern="[a-z0-9_-]{2,32}"
          autoComplete="username"
        />
        <span className="field-hint">Lowercase letters, numbers, hyphens and underscores only.</span>
      </div>

      <div className="field">
        <label>Display name (optional)</label>
        <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} />
      </div>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', fontSize: 'var(--text-sm)', margin: '0 0 var(--space-4)', cursor: 'pointer', color: 'var(--color-text)' }}>
        <input
          type="checkbox"
          checked={agreedToPolicy}
          onChange={(e) => setAgreedToPolicy(e.target.checked)}
          style={{ marginTop: 2 }}
        />
        <span>
          I agree to the{' '}
          {privacyPolicyUrl ? <a href={privacyPolicyUrl}>privacy policy</a> : 'privacy policy'}.
        </span>
      </label>

      {turnstileSiteKey && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <TurnstileWidget siteKey={turnstileSiteKey} onVerify={setTurnstileToken} onExpire={() => setTurnstileToken('')} />
        </div>
      )}

      <button
        type="submit"
        className="btn btn-primary btn-lg"
        style={{ width: '100%' }}
        disabled={loading || !email || !username || !agreedToPolicy || (!!turnstileSiteKey && !turnstileToken)}
      >
        {loading ? 'Creating account…' : 'Create account'}
      </button>

      {registrationMode === 'APPROVAL_REQUIRED' && (
        <p className="field-hint" style={{ marginTop: 'var(--space-3)', textAlign: 'center' }}>
          New accounts need admin approval before signing in.
        </p>
      )}
    </form>
  )
}
