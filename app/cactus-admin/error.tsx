'use client'

import { useEffect } from 'react'

/**
 * Catches a thrown render anywhere under the admin prefix, including the sign-in
 * page (which sits in this segment but outside AdminLayout's shell).
 *
 * Without a boundary here, a single failed query - a cold instance losing its
 * first connection, say - served Next's bare "Internal Server Error" page: no
 * explanation, no way back, and no hint that simply trying again would work.
 * Which it usually does, since these failures are transient by nature. reset()
 * re-runs the server render, so the button is a real retry rather than decoration.
 *
 * Errors thrown by AdminLayout itself land on the parent boundary, not this one -
 * that is how React nests them - which is why the layout guards its own reads
 * inline (best-effort fallbacks, plus a redirect to login if the session read
 * fails) rather than relying on a boundary that would never catch them.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[admin] render failed', error)
  }, [error])

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-6)',
        background: 'var(--color-bg)',
        color: 'var(--color-text)',
      }}
    >
      <div
        style={{
          maxWidth: 420,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
          padding: 'var(--space-6)',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-semibold)', margin: 0 }}>
          That didn&rsquo;t load
        </h1>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: 0 }}>
          Something went wrong on our side. It is usually a passing hiccup, so trying
          again is the first thing worth doing.
        </p>
        {error.digest && (
          <p
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-muted)',
              fontFamily: 'var(--font-mono)',
              margin: 0,
            }}
          >
            Reference: {error.digest}
          </p>
        )}
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button className="btn btn-primary btn-sm" onClick={reset}>
            Try again
          </button>
        </div>
      </div>
    </div>
  )
}
