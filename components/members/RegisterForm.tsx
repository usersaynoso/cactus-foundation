'use client'

import { useEffect, useState } from 'react'
import TurnstileWidget from '@/components/members/TurnstileWidget'
import type { MembersConfig } from '@/lib/members/config'

type Props = {
  registrationMode: MembersConfig['registrationMode']
  inviteToken?: string
  privacyPolicyUrl?: string
  // Prefilled from the ?email= query param for anyone arriving from somewhere
  // that already knows their address. A starting value only - it is an ordinary
  // editable field, and the address still has to be verified.
  initialEmail?: string
  // Mirror of the members config: an admin can drop the username picker (one
  // is generated from the email address) and the display name from the form.
  // Default true so the Puck editor preview and any older caller still get the
  // full form rather than silently losing fields.
  collectUsername?: boolean
  collectDisplayName?: boolean
  // Embedded uses - a shop's post-purchase prompt, say - already sit under a
  // heading of their own, and the form's own title would be the second "Create
  // an account" on the same screen.
  showHeading?: boolean
  // Where someone whose address still needs verifying is sent next. Derived
  // from the current path by default, which only ever works on the register
  // page itself: an embedded form is on some other URL entirely, and the
  // derivation quietly reloaded that page with an ?email= on it instead.
  verifyEmailUrl?: string
}

type RegisterResult = { status: string; verifyEmailRequired: boolean; verificationEmailSent?: boolean }

export default function RegisterForm({
  registrationMode,
  inviteToken,
  privacyPolicyUrl,
  initialEmail,
  collectUsername = true,
  collectDisplayName = true,
  showHeading = true,
  verifyEmailUrl,
}: Props) {
  const [email, setEmail] = useState(initialEmail ?? '')
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
          username: collectUsername ? username : undefined,
          displayName: collectDisplayName ? displayName || undefined : undefined,
          agreedToPolicy,
          turnstileToken: turnstileToken || undefined,
          inviteToken,
        }),
      })
      // An error response isn't guaranteed to be JSON - a crashed route hands
      // back a bare 500 - and letting res.json() throw put the browser's own
      // parse-failure wording in front of the member as if it were the site
      // explaining itself. Safari's version of that reads "The string did not
      // match the expected pattern.", which helps nobody.
      const d = (await res.json().catch(() => ({}))) as Partial<RegisterResult> & { error?: string }
      if (!res.ok) throw new Error(d.error ?? 'Registration failed')

      const registerResult = d as RegisterResult
      setResult(registerResult)
      // Parking them on the verify-email page to wait for a link that was
      // never sent helps nobody, so a failed send keeps them here with the
      // truth instead.
      if (registerResult.verifyEmailRequired && registerResult.verificationEmailSent !== false) {
        const target = verifyEmailUrl ?? window.location.pathname.replace(/\/register$/, '/verify-email')
        window.location.href = `${target}?email=${encodeURIComponent(email)}`
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  if (result && result.verifyEmailRequired && result.verificationEmailSent === false) {
    return (
      <div className="alert alert-warning">
        Your account was created, but the verification email couldn&apos;t be sent. Nothing is wrong with
        what you typed - this site&apos;s outgoing email isn&apos;t working. Please try again shortly, or
        let the site owner know.
      </div>
    )
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
      {showHeading && (
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-semibold)', margin: '0 0 var(--space-5)', color: 'var(--color-text)' }}>
          Create an account
        </h1>
      )}

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="field">
        <label>Email address</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      </div>

      {collectUsername && (
        <div className="field">
          <label>Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            required
            // The hyphen is escaped because browsers compile `pattern` with the
            // regex `v` flag, where a bare trailing `-` in a character class is
            // a syntax error. An uncompilable pattern is skipped rather than
            // enforced, so the unescaped version quietly validated nothing.
            pattern="[a-z0-9_\-]{2,32}"
            autoComplete="username"
          />
          <span className="field-hint">Lowercase letters, numbers, hyphens and underscores only.</span>
        </div>
      )}

      {collectDisplayName && (
        <div className="field">
          <label>Display name (optional)</label>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} />
        </div>
      )}

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
        disabled={
          loading ||
          !email ||
          (collectUsername && !username) ||
          !agreedToPolicy ||
          (!!turnstileSiteKey && !turnstileToken)
        }
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
