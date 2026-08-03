'use client'

import { useEffect, useState } from 'react'

type Step = 'email' | 'methods' | 'magic-sent' | 'consuming' | 'password' | '2fa' | 'recovery-code'
type TwoFactorMethod = 'EMAIL' | 'AUTHENTICATOR_APP' | 'SMS'

// Which sign-in methods the address typed on the first step can actually use,
// from /api/members/auth/methods.
type AuthMethods = { passkey: boolean; password: boolean; magicLink: boolean }

// Enough of a check to stop "Continue" firing on an obvious typo, which would
// otherwise end in a cheerful "check your inbox" for an address that can never
// receive anything. Real validation is the API's job.
const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())

type Props = {
  redirectTo: string
  magicToken?: string
  // Where the member area lives ("/account"). The sign-in page leaves this off:
  // it already sits inside the member area, so its own detours resolve
  // correctly against the current URL. Anywhere else the form is shown - the
  // Members: Sign In block's modal, floating over an arbitrary page - has to be
  // told, or "verify your email" would send the visitor to /verify-email off
  // whatever page they happened to be reading.
  basePath?: string
  // The sign-in page wants the form's own "Sign in" heading; a dialog that
  // already carries one does not.
  showHeading?: boolean
}

export default function LoginForm({ redirectTo, magicToken, basePath, showHeading = true }: Props) {
  const [step, setStep] = useState<Step>(magicToken ? 'consuming' : 'email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [trustBrowser, setTrustBrowser] = useState(false)
  const [memberId, setMemberId] = useState('')
  const [twoFactorMethod, setTwoFactorMethod] = useState<TwoFactorMethod>('EMAIL')
  const [twoFactorDestination, setTwoFactorDestination] = useState('')
  const [siteMethods, setSiteMethods] = useState<AuthMethods>({ passkey: false, password: false, magicLink: false })
  const [methods, setMethods] = useState<AuthMethods | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // Which of the second step's buttons is the one currently working, so only
  // that button swaps to a busy label while the rest simply grey out.
  const [pendingMethod, setPendingMethod] = useState<'passkey' | 'magicLink' | null>(null)

  useEffect(() => {
    fetch('/api/members/auth/config')
      .then((r) => r.json())
      .then((d: { enabledAuthMethods?: string[] }) => {
        const enabled = d.enabledAuthMethods ?? []
        setSiteMethods({
          passkey: enabled.includes('PASSKEY'),
          password: enabled.includes('PASSWORD'),
          magicLink: enabled.includes('MAGIC_LINK'),
        })
      })
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
            handleRedirectToVerify(d.email ?? '')
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

  // Relative when no basePath is given, so the sign-in page keeps resolving it
  // against its own URL exactly as it always has.
  function handleRedirectToVerify(emailForVerify: string) {
    const query = `verify-email?email=${encodeURIComponent(emailForVerify)}`
    window.location.href = basePath ? `${basePath}/${query}` : query
  }

  // When the site requires a mobile number for sign-in codes and this member
  // hasn't added one yet, land them on the account overview (where the
  // enrolment card lives) instead of wherever they were headed.
  function finishLogin(smsEnrolmentRequired?: boolean) {
    window.location.href = smsEnrolmentRequired
      ? (basePath || window.location.pathname.replace(/\/login$/, '') || '/')
      : redirectTo
  }

  // First step: work out which methods this address has before offering any.
  // A lookup that fails falls back to everything the site allows - a network
  // blip must not hide the passkey button from someone who has a passkey.
  async function handleContinue() {
    setError('')
    setLoading(true)
    // Normalise once here so every later step - passkey, password, link -
    // works from the same address the lookup was answered for.
    const address = email.trim()
    setEmail(address)
    let resolved: AuthMethods
    try {
      const res = await fetch('/api/members/auth/methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: address }),
      })
      if (!res.ok) throw new Error('lookup failed')
      const d: AuthMethods = await res.json()
      resolved = { passkey: Boolean(d.passkey), password: Boolean(d.password), magicLink: Boolean(d.magicLink) }
    } catch {
      resolved = siteMethods
    }
    setMethods(resolved)

    // Nothing to choose between: no password, no passkey, link only. Showing a
    // step whose one button says "Email me a sign-in link" is just asking the
    // member to press Continue twice, so send it now. The address is passed
    // through rather than read back off state, which has not settled yet.
    if (!resolved.passkey && !resolved.password && resolved.magicLink) {
      await handleMagicLink(address)
      return
    }

    setLoading(false)
    setStep('methods')
  }

  async function handlePasskeyLogin() {
    setError('')
    setLoading(true)
    setPendingMethod('passkey')
    try {
      const { startAuthentication } = await import('@simplewebauthn/browser')

      const optRes = await fetch('/api/members/auth/passkey/authenticate-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(email ? { email } : {}),
      })
      const opts = await optRes.json()
      if (!optRes.ok) throw new Error(opts.error ?? 'Failed to start passkey sign-in')

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
      setPendingMethod(null)
    }
  }

  // Takes the address explicitly so the automatic send at the end of
  // handleContinue can pass the normalised one before setEmail has landed.
  async function handleMagicLink(address: string = email) {
    setError('')
    setLoading(true)
    setPendingMethod('magicLink')
    try {
      await fetch('/api/members/auth/magic-link/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: address }),
      })
      setStep('magic-sent')
    } catch {
      setError('Failed to send sign-in link')
    } finally {
      setLoading(false)
      setPendingMethod(null)
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

  // The link can now arrive without anyone having pressed a button for it, so
  // there has to be a way back from a mistyped address - otherwise Continue on
  // a typo is a dead end.
  if (step === 'magic-sent') {
    return (
      <div>
        <div className="alert alert-success">
          Check <strong>{email}</strong> for a sign-in link. It expires in 15 minutes.
        </div>
        <button
          className="btn btn-link"
          onClick={() => { setStep('email'); setMethods(null); setError('') }}
        >
          Use a different email address
        </button>
      </div>
    )
  }

  const heading = showHeading
    ? (
      <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-semibold)', margin: '0 0 var(--space-5)', color: 'var(--color-text)' }}>
        Sign in
      </h1>
    )
    : null

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

  // The address is settled by this point, so it's shown rather than asked for
  // again - but as a real (read-only) field, so password managers still see a
  // username to match the saved credential against.
  const settledEmailField = (
    <div className="field">
      <label>Email address</label>
      <input type="email" value={email} autoComplete="username" readOnly />
    </div>
  )

  if (step === 'password') {
    return (
      <div>
        {heading}
        {error && <div className="alert alert-danger">{error}</div>}
        {settledEmailField}
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && email && password && !loading) handlePasswordSubmit() }}
            autoComplete="current-password"
            autoFocus
          />
        </div>
        <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={!email || !password || loading} onClick={handlePasswordSubmit}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
        <button className="btn btn-secondary" style={{ width: '100%', marginTop: 'var(--space-2)' }} onClick={() => { setStep('methods'); setPassword(''); setError('') }}>
          Back
        </button>
      </div>
    )
  }

  // Second step: only the methods this account can actually use. A member who
  // has never set a password or added a passkey sees the sign-in link alone,
  // rather than two buttons that could only ever fail. The first one offered is
  // the primary: passkey if they have one, else password, else the link.
  if (step === 'methods') {
    const m = methods ?? siteMethods
    const primary = m.passkey ? 'passkey' : m.password ? 'password' : 'magicLink'
    const buttonClass = (name: string) =>
      name === primary ? 'btn btn-primary btn-lg' : 'btn btn-secondary'

    return (
      <div>
        {heading}

        {error && <div className="alert alert-danger">{error}</div>}

        {settledEmailField}

        {m.passkey && (
          <button
            className={buttonClass('passkey')}
            style={{ width: '100%', marginBottom: 'var(--space-3)' }}
            disabled={loading}
            onClick={handlePasskeyLogin}
          >
            {pendingMethod === 'passkey' ? 'Waiting for passkey…' : '🔑 Sign in with passkey'}
          </button>
        )}

        {m.password && (
          <button
            className={buttonClass('password')}
            style={{ width: '100%', marginBottom: 'var(--space-3)' }}
            disabled={loading}
            onClick={() => { setStep('password'); setError('') }}
          >
            Sign in with a password
          </button>
        )}

        {m.magicLink && (
          <button
            className={buttonClass('magicLink')}
            style={{ width: '100%', marginBottom: 'var(--space-3)' }}
            disabled={loading}
            onClick={() => handleMagicLink()}
          >
            {pendingMethod === 'magicLink' ? 'Sending…' : 'Email me a sign-in link'}
          </button>
        )}

        {!m.passkey && !m.password && !m.magicLink && (
          <p className="field-hint" style={{ marginBottom: 'var(--space-3)' }}>
            No sign-in method is available at the moment. Please try again later.
          </p>
        )}

        <button
          className="btn btn-link"
          disabled={loading}
          onClick={() => { setStep('email'); setMethods(null); setError('') }}
        >
          Use a different email address
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
          onKeyDown={(e) => { if (e.key === 'Enter' && looksLikeEmail(email) && !loading) handleContinue() }}
          autoComplete="email"
          autoFocus
        />
      </div>

      <button
        className="btn btn-primary btn-lg"
        style={{ width: '100%' }}
        disabled={!looksLikeEmail(email) || loading}
        onClick={handleContinue}
      >
        {pendingMethod === 'magicLink' ? 'Sending…' : loading ? 'Checking…' : 'Continue'}
      </button>
    </div>
  )
}
