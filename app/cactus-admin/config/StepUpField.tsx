'use client'

import { useEffect, useState } from 'react'

// "Prove it is still you" for the dangerous buttons on the config screen -
// downloading or restoring the whole database, wiping it, deleting the site's
// environment variables. The server decides (lib/auth/step-up.ts); this only
// asks for the right thing. An account with a password types it again. A
// passkey-only account has nothing to type and must have signed in within the
// last ten minutes instead, so it gets a sentence rather than an empty box.
//
// One fetch of /api/account/password per mounted field. While that is in flight
// the box is shown, because asking for a password nobody needed costs a second;
// hiding one that was needed costs a confusing refusal.

type Props = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function StepUpField({ value, onChange, disabled }: Props) {
  const [hasPassword, setHasPassword] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/account/password')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { hasPassword?: boolean } | null) => {
        if (!cancelled) setHasPassword(d?.hasPassword ?? true)
      })
      .catch(() => {
        if (!cancelled) setHasPassword(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (hasPassword === false) {
    return (
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: '0 0 0.75rem' }}>
        You sign in with a passkey only, so this needs you to have signed in within the last ten minutes. If it
        refuses, sign out, sign back in and try again.
      </p>
    )
  }

  return (
    <label style={{ fontSize: 'var(--text-sm)', display: 'block', marginBottom: '0.75rem' }}>
      Your password, to confirm it is you
      <input
        type="password"
        autoComplete="current-password"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{ display: 'block', maxWidth: '20rem', marginTop: '0.25rem' }}
      />
    </label>
  )
}
