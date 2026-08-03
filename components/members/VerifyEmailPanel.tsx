'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { setMemberFlash } from '@/lib/members/flash'

type State = 'checking' | 'success' | 'error' | 'pending'

// ?email= is put on the page as text, so it has to look like an address before
// it is shown: a crafted link could otherwise print any wording it liked under
// the site's own name. Anything else falls through to the "type your address"
// form, which is the same place a visitor with no parameter at all lands.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Props = {
  // Only set when registration is actually open to walk-ups. Invite-only sites
  // would be offering a door that needs a key nobody has, so they get no link.
  registerHref?: string
  // The member area itself, where a verified visitor is sent. The gate there
  // hands a signed-out one on to the sign-in page, which is the next thing
  // they need anyway.
  accountHref: string
}

export default function VerifyEmailPanel({ registerHref, accountHref }: Props) {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent registerHref={registerHref} accountHref={accountHref} />
    </Suspense>
  )
}

function VerifyEmailContent({ registerHref, accountHref }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const emailParam = searchParams.get('email') ?? ''
  // The address we were handed by the register/login redirect. When we have it
  // there is nothing for the visitor to type, and offering a box invites them
  // to "correct" a typo here - which this page cannot do. The resend endpoint
  // only ever re-sends to an address that is already waiting to be verified.
  const knownEmail = EMAIL_RE.test(emailParam) ? emailParam : ''

  const [state, setState] = useState<State>(token ? 'checking' : 'pending')
  const [message, setMessage] = useState('')
  const [typedEmail, setTypedEmail] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)

  const target = knownEmail || typedEmail

  // A verification token is spent the first time it is sent. Anything that runs
  // this effect a second time for the same token (a re-render carrying a new
  // router identity, React's development double-invoke) would be asking the API
  // to consume a token that is already gone, and the second answer - "invalid
  // or has expired" - would land on a visitor who did nothing wrong.
  const submitted = useRef(false)

  useEffect(() => {
    if (!token || submitted.current) return
    submitted.current = true
    fetch('/api/members/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const d = await res.json()
        if (!res.ok) throw new Error(d.error ?? 'Verification failed')
        setState('success')
        // Nothing left to do on this page, so the good news travels with them
        // to the member area as a pill rather than parking them on a screen
        // whose only remaining purpose is to be left.
        setMemberFlash(
          d.status === 'PENDING_APPROVAL'
            ? 'Your email is verified. Your account is now awaiting admin approval.'
            : 'Your email is verified. You can now sign in.'
        )
        router.replace(accountHref)
      })
      .catch((err: unknown) => {
        setState('error')
        setMessage(err instanceof Error ? err.message : 'Verification failed')
      })
  }, [token, router, accountHref])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  async function handleResend() {
    if (!target || resendCooldown > 0) return
    await fetch('/api/members/verify-email/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: target }),
    }).catch(() => {})
    // The endpoint answers {ok:true} to everything on purpose, so the wording
    // here has to promise nothing about whether that address is registered.
    setSentTo(target)
    setResendCooldown(60)
  }

  return (
    <div style={{ maxWidth: 440, margin: '4rem auto', padding: '0 1.5rem', textAlign: 'center' }}>
      {state === 'checking' && <p style={{ color: 'var(--color-text-muted)' }}>Verifying your email…</p>}

      {/* The wording itself is carried to the member area as a pill, so all
          that's wanted here is somewhere to look while the browser moves - and
          a door to go through by hand if it somehow doesn't. */}
      {state === 'success' && (
        <p style={{ color: 'var(--color-text-muted)' }}>
          Taking you to your account… <a href={accountHref}>Go there now</a> if nothing happens.
        </p>
      )}

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
          {sentTo ? (
            <div className="alert alert-success" style={{ marginBottom: 'var(--space-3)' }}>
              A new link is on its way to {sentTo}, assuming that address is still waiting to be verified. It can
              take a minute or two, and it does like to hide in spam folders.
            </div>
          ) : knownEmail ? (
            <p style={{ color: 'var(--color-text-secondary)' }}>
              We sent a verification link to <strong>{knownEmail}</strong>. Check your inbox, and the spam folder
              while you&apos;re there. Didn&apos;t get it?
            </p>
          ) : (
            <p style={{ color: 'var(--color-text-secondary)' }}>
              Check your inbox for a verification link. Didn&apos;t get it?
            </p>
          )}

          {!knownEmail && (
            <div className="field" style={{ maxWidth: 320, margin: '0 auto var(--space-3)', textAlign: 'left' }}>
              <label htmlFor="verify-resend-email">Email address you registered with</label>
              <input
                id="verify-resend-email"
                type="email"
                value={typedEmail}
                onChange={(e) => setTypedEmail(e.target.value)}
                placeholder="your@email.com"
                autoComplete="email"
              />
            </div>
          )}

          <button className="btn btn-secondary" disabled={!target || resendCooldown > 0} onClick={handleResend}>
            {resendCooldown > 0
              ? `Resend in ${resendCooldown}s`
              : sentTo
                ? 'Send another link'
                : knownEmail
                  ? 'Send it again'
                  : 'Send verification link'}
          </button>

          {registerHref && (
            <p
              style={{
                marginTop: 'var(--space-4)',
                color: 'var(--color-text-muted)',
                fontSize: 'var(--text-sm)',
              }}
            >
              Typed your address wrong? <a href={registerHref}>Sign up again</a> with the right one - the half-made
              account you left behind will keep itself to itself.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
