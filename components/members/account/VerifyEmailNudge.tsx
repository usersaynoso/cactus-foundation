'use client'

import { useState } from 'react'

// The unverified-email nag on the account overview. Unverified is not a
// cosmetic state: shop order history is deliberately withheld until the address
// is proved (anyone can type someone else's email into a sign-up form), so the
// member needs somewhere obvious to ask for the email again.

export default function VerifyEmailNudge({ email }: { email: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function resend() {
    setState('sending')
    try {
      const res = await fetch('/api/members/verify-email/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      // The endpoint deliberately does not confirm whether an address exists,
      // so anything short of a transport failure is reported as sent.
      setState(res.ok ? 'sent' : 'error')
    } catch {
      setState('error')
    }
  }

  return (
    <div className="alert alert-warning" style={{ marginBottom: 'var(--space-4)' }}>
      <div>
        <strong>Confirm your email address.</strong> We sent a link to {email}. Until you
        follow it, some things stay locked - including any orders placed before you signed up.
      </div>
      <div style={{ marginTop: 'var(--space-2)' }}>
        {state === 'sent' ? (
          <span>Sent. Have a look in your inbox, and the spam folder if it is shy.</span>
        ) : (
          <button type="button" className="btn btn-sm" onClick={resend} disabled={state === 'sending'}>
            {state === 'sending' ? 'Sending…' : 'Send it again'}
          </button>
        )}
        {state === 'error' && (
          <span style={{ marginLeft: 'var(--space-2)', color: 'var(--color-error)' }}>
            That did not go through. Try again in a moment.
          </span>
        )}
      </div>
    </div>
  )
}
