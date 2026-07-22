'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/** How long before expiry the warning appears. */
const WARN_BEFORE_MS = 2 * 60 * 1000
/**
 * Longest single timer we set. The whole point is to avoid work, but one 24-hour
 * timeout is unreliable: background tabs get throttled and a sleeping laptop stops
 * the clock entirely. Re-arming every 15 minutes costs 96 wakeups a day (nothing)
 * and lets each one recompute against the real time.
 */
const MAX_TIMER_MS = 15 * 60 * 1000

type Props = {
  /**
   * Milliseconds of session left at render time. Deliberately a duration rather
   * than an absolute timestamp: the deadline is then anchored to the browser's
   * own clock, so a machine set to the wrong time cannot sign anyone out early.
   */
  expiresInMs: number
  adminPath: string
}

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${mins}:${String(secs).padStart(2, '0')}`
}

/**
 * Takes an open admin tab to the login page when its session runs out.
 *
 * Sessions last 24 hours and the server gates every request, so a stale tab was
 * never a security hole - it just sat there looking signed in until the next
 * click bounced. This closes that gap with no polling and no extra requests:
 * the expiry is known at render time, so it is pure arithmetic against the clock.
 *
 * A warning shows two minutes out, deliberately as a corner banner rather than a
 * blocking overlay, so anyone mid-edit can still reach their save button.
 */
export default function SessionExpiryWatcher({ expiresInMs, adminPath }: Props) {
  // Pinned once, on the client's clock. The admin shell is a persistent layout, so
  // this survives client-side navigation and only re-anchors on a full page load.
  const [deadline] = useState(() => Date.now() + expiresInMs)
  // Non-null only inside the warning window; holds the milliseconds remaining.
  const [warnMsLeft, setWarnMsLeft] = useState<number | null>(null)
  const redirected = useRef(false)

  const goToLogin = useCallback(() => {
    if (redirected.current) return
    redirected.current = true
    const here = window.location.pathname + window.location.search
    const url = new URL(`/${adminPath}/login`, window.location.origin)
    url.searchParams.set('next', here)
    url.searchParams.set('expired', '1')
    window.location.href = url.toString()
  }, [adminPath])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined

    const check = () => {
      const left = deadline - Date.now()
      if (left <= 0) {
        goToLogin()
        return
      }
      if (left <= WARN_BEFORE_MS) {
        setWarnMsLeft(left)
        // Tick the countdown once a second while the banner is up.
        timer = setTimeout(check, Math.min(1000, left))
        return
      }
      setWarnMsLeft(null)
      timer = setTimeout(check, Math.min(left - WARN_BEFORE_MS, MAX_TIMER_MS))
    }

    // Waking from sleep or switching back to the tab is exactly when a stale
    // screen gets looked at, so recheck then instead of trusting the timer.
    const onWake = () => {
      if (document.visibilityState !== 'visible') return
      if (timer) clearTimeout(timer)
      check()
    }

    check()
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('focus', onWake)
    return () => {
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('focus', onWake)
    }
  }, [deadline, goToLogin])

  if (warnMsLeft === null) return null

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        right: 'var(--space-4)',
        bottom: 'var(--space-4)',
        zIndex: 80,
        maxWidth: 340,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        padding: 'var(--space-4)',
        background: 'var(--color-warning-bg)',
        border: '1px solid var(--color-warning-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-xl)',
        color: 'var(--color-warning)',
      }}
    >
      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)' }}>
        Session about to expire
      </div>
      {/* The countdown is hidden from assistive tech - it would re-announce every
          second. The static sentence below carries the same message once. */}
      <div style={{ fontSize: 'var(--text-sm)' }} aria-hidden="true">
        You will be signed out in{' '}
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 'var(--font-semibold)' }}>
          {formatRemaining(warnMsLeft)}
        </span>
        . Save anything in progress.
      </div>
      <div className="sr-only">
        Your session expires in under two minutes. Save any work in progress, then sign in again.
      </div>
      <div>
        <button className="btn btn-primary btn-sm" onClick={goToLogin}>
          Sign in again
        </button>
      </div>
    </div>
  )
}
