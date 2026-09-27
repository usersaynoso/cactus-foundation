'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { SESSION_IDLE_MS, SESSION_TOUCH_EVERY_MS } from '@/lib/auth/session-timing'

/** How long before expiry the warning appears. */
const WARN_BEFORE_MS = 2 * 60 * 1000
/**
 * Longest single timer we set. The whole point is to avoid work, but one 24-hour
 * timeout is unreliable: background tabs get throttled and a sleeping laptop stops
 * the clock entirely. Re-arming every 15 minutes costs 96 wakeups a day (nothing)
 * and lets each one recompute against the real time.
 */
const MAX_TIMER_MS = 15 * 60 * 1000
/**
 * What counts as somebody using the site. Only things a person does: the
 * requests an open tab makes by itself (the notification poll, a module's
 * background services) fire none of these, which is what stops a forgotten tab
 * from keeping itself signed in for ever.
 */
const ACTIVITY_EVENTS = ['pointerdown', 'keydown'] as const

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
 * How long the session has left, from the server. POST also restarts the idle
 * clock; GET only reads it. Resolves to the milliseconds left, 0 when the session
 * is gone, or null when no answer could be had (offline, a blip) - in which case
 * the caller carries on with what it already knew.
 */
async function askServer(method: 'GET' | 'POST'): Promise<number | null> {
  try {
    const res = await fetch('/api/auth/session', { method, cache: 'no-store' })
    if (res.status === 401) return 0
    if (!res.ok) return null
    const data: unknown = await res.json()
    if (
      typeof data === 'object' && data !== null &&
      'expiresInMs' in data && typeof data.expiresInMs === 'number'
    ) {
      return Math.max(0, data.expiresInMs)
    }
    return null
  } catch {
    return null
  }
}

/**
 * Keeps an admin session going while somebody is using it, and takes an open tab
 * to the login page once it has run out.
 *
 * Sessions end after SESSION_IDLE_MS without use, not a fixed time after sign-in.
 * A click or key press tells the server to restart that clock - at most once per
 * SESSION_TOUCH_EVERY_MS, so a busy afternoon costs a request every few minutes
 * rather than one per keystroke. Between those, it is pure arithmetic against the
 * browser's clock, the same as it always was.
 *
 * Other tabs share the session, so this one's countdown can be out of date: a day
 * spent working in one tab moves the session along without this tab hearing about
 * it. So before warning anyone, and again before signing them out, it asks the
 * server (a read that does not itself count as use) and simply carries on if the
 * session turns out to have more time than it thought.
 *
 * A warning shows two minutes out, deliberately as a corner banner rather than a
 * blocking overlay, so anyone mid-edit can still reach their save button - and
 * reaching it counts as activity, which puts the banner away again.
 */
export default function SessionExpiryWatcher({ expiresInMs, adminPath }: Props) {
  // Anchored on the client's clock at the first render, then moved on each time
  // the server confirms the session has more time. The admin shell is a persistent
  // layout, so this survives client-side navigation.
  const [deadline, setDeadline] = useState(() => Date.now() + expiresInMs)
  // Non-null only inside the warning window; holds the milliseconds remaining.
  const [warnMsLeft, setWarnMsLeft] = useState<number | null>(null)
  const redirected = useRef(false)
  const touching = useRef(false)
  const lastTouchAttempt = useRef(0)
  // Which stage of which deadline the server has already been asked about, so a
  // countdown asks once before its warning and once before its end, never per tick.
  const askedAbout = useRef<string | null>(null)

  const goToLogin = useCallback(() => {
    if (redirected.current) return
    redirected.current = true
    const here = window.location.pathname + window.location.search
    const url = new URL(`/${adminPath}/login`, window.location.origin)
    url.searchParams.set('next', here)
    url.searchParams.set('expired', '1')
    window.location.href = url.toString()
  }, [adminPath])

  // `force` is the "Stay signed in" button: somebody asked in so many words, so
  // it skips both throttles below.
  const touch = useCallback(async (force: boolean) => {
    if (touching.current || redirected.current) return
    const now = Date.now()
    if (!force) {
      // Moved recently enough already - at sign-in, or by an earlier touch.
      if (deadline - now > SESSION_IDLE_MS - SESSION_TOUCH_EVERY_MS) return
      // Tried recently and got nowhere (offline, say): no retry on every key press.
      if (now - lastTouchAttempt.current < SESSION_TOUCH_EVERY_MS) return
    }
    touching.current = true
    lastTouchAttempt.current = now
    const left = await askServer('POST')
    touching.current = false
    // A refusal (0) is deliberately not acted on here. Every request the page makes
    // is refused by the server anyway, and bouncing to the login page on a mere
    // click could throw away an unsaved edit; the countdown will get there.
    if (left) setDeadline(Date.now() + left)
  }, [deadline])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false

    // True when a question has gone to the server and check() will run again once
    // it answers; false when this stage was already asked about.
    const askFirst = (stage: 'warn' | 'end'): boolean => {
      const key = `${deadline}:${stage}`
      if (askedAbout.current === key) return false
      askedAbout.current = key
      void askServer('GET').then((left) => {
        if (cancelled) return
        if (left === 0) {
          goToLogin()
          return
        }
        // More time than we thought: another tab has been busy. Re-anchor, which
        // re-runs this effect against the new deadline.
        if (left !== null && Date.now() + left > deadline + 5000) {
          setDeadline(Date.now() + left)
          return
        }
        if (timer) clearTimeout(timer)
        check()
      })
      return true
    }

    const check = () => {
      const left = deadline - Date.now()
      if (left <= WARN_BEFORE_MS && askFirst(left <= 0 ? 'end' : 'warn')) return
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
      cancelled = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('focus', onWake)
    }
  }, [deadline, goToLogin])

  // Capture phase, so a component that stops an event from bubbling cannot hide
  // the fact that somebody used the page.
  useEffect(() => {
    const onActivity = () => {
      void touch(false)
    }
    for (const type of ACTIVITY_EVENTS) {
      window.addEventListener(type, onActivity, { capture: true, passive: true })
    }
    return () => {
      for (const type of ACTIVITY_EVENTS) {
        window.removeEventListener(type, onActivity, { capture: true })
      }
    }
  }, [touch])

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
        Still there?
      </div>
      {/* The countdown is hidden from assistive tech - it would re-announce every
          second. The static sentence below carries the same message once. */}
      <div style={{ fontSize: 'var(--text-sm)' }} aria-hidden="true">
        Nothing has happened for a while, so you will be signed out in{' '}
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 'var(--font-semibold)' }}>
          {formatRemaining(warnMsLeft)}
        </span>
        .
      </div>
      <div className="sr-only">
        Nothing has happened for a while, so you will be signed out in under two minutes unless you choose to stay signed in.
      </div>
      <div>
        <button className="btn btn-primary btn-sm" onClick={() => void touch(true)}>
          Stay signed in
        </button>
      </div>
    </div>
  )
}
