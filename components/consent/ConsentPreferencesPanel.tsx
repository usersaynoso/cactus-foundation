'use client'

import { useEffect, useState } from 'react'
import type { ConsentBannerConfig, ConsentDecision } from '@/lib/consent/types'
import { buildDefaultDecision, resolveCurrentDecision, saveConsentDecision } from '@/lib/consent/client'

// Horizontal gutter classes emitted by buildTokenStyles, matching what a Rich
// Text block at 'default' padding gets. Written out rather than imported from
// lib/puck/config.tsx: this is a client component and that import would drag the
// whole builder config into the public bundle.
const GUTTER_CLASSES = 'cactus-pad-d-default cactus-pad-t-default cactus-pad-m-default'

type Props = {
  config: ConsentBannerConfig
}

/**
 * The cookie choices a visitor made in the banner, laid out on the page itself so
 * they can be changed without waiting to be asked again. Rendered above the
 * privacy policy page's own content.
 */
export default function ConsentPreferencesPanel({ config }: Props) {
  const [decision, setDecision] = useState<ConsentDecision>(() => buildDefaultDecision(config.categories))
  const [storedAt, setStoredAt] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Cookies are only readable in the browser, so the first paint shows the
  // configured defaults and this swaps in the visitor's own choices. Doing it in
  // an effect is what keeps the server and client markup identical.
  useEffect(() => {
    const current = resolveCurrentDecision(config)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating from a cookie is browser-only by nature and settles in one pass
    setDecision(current.decision)
    setStoredAt(current.storedAt)
  }, [config])

  const adjustable = config.categories.filter((cat) => !cat.required)

  async function apply(next: ConsentDecision, action: 'accept_all' | 'reject_all' | 'custom') {
    setDecision(next)
    setStoredAt(new Date().toISOString())
    setSaved(true)
    await saveConsentDecision(config, next, action)
  }

  function handleAcceptAll() {
    const all: ConsentDecision = {}
    for (const cat of config.categories) all[cat.key] = true
    apply(all, 'accept_all')
  }

  function handleRejectAll() {
    const none: ConsentDecision = {}
    for (const cat of config.categories) none[cat.key] = cat.required
    apply(none, 'reject_all')
  }

  function handleSave() {
    apply(decision, 'custom')
  }

  const btnPrimaryStyle: React.CSSProperties = {
    background: 'var(--color-primary)',
    color: 'var(--color-on-primary)',
    border: '1px solid var(--color-primary)',
    borderRadius: 'var(--radius-md)',
    padding: '0.5rem 1rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  }

  const btnSecondaryStyle: React.CSSProperties = {
    background: 'transparent',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    padding: '0.5rem 1rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  }

  // A site with nothing but required categories has no choice to offer, so the
  // panel would be a row of locked switches. Say nothing instead.
  if (!adjustable.length) return null

  return (
    <div className={GUTTER_CLASSES}>
      <section
        aria-labelledby="cactus-consent-panel-title"
        style={{
          margin: '2rem auto',
          maxWidth: 720,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: '1.5rem',
        }}
      >
        <h2
          id="cactus-consent-panel-title"
          style={{ margin: '0 0 0.5rem', fontSize: '1.125rem', fontWeight: 600, color: 'var(--color-text)' }}
        >
          Your cookie preferences
        </h2>
        <p style={{ margin: '0 0 1.25rem', fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
          Change what you allow us to use at any time. Your choice takes effect straight away and is remembered on this device.
        </p>

        <div style={{ marginBottom: '1.25rem' }}>
          {config.categories.map((cat) => (
            <label
              key={cat.key}
              style={{
                display: 'flex',
                gap: '0.75rem',
                alignItems: 'flex-start',
                padding: '0.75rem 0',
                borderTop: '1px solid var(--color-border)',
                cursor: cat.required ? 'default' : 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={cat.required ? true : (decision[cat.key] ?? false)}
                disabled={cat.required}
                onChange={(e) => {
                  if (cat.required) return
                  setSaved(false)
                  setDecision((prev) => ({ ...prev, [cat.key]: e.target.checked }))
                }}
                style={{ marginTop: 3, flexShrink: 0 }}
              />
              <span>
                <span style={{ fontSize: '0.9375rem', fontWeight: 500, color: 'var(--color-text)', display: 'block' }}>
                  {cat.label}
                  {cat.required && (
                    <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 400 }}>
                      Always on
                    </span>
                  )}
                </span>
                {cat.description && (
                  <span style={{ fontSize: '0.8125rem', lineHeight: 1.5, color: 'var(--color-text-muted)', display: 'block', marginTop: 2 }}>
                    {cat.description}
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" style={btnPrimaryStyle} onClick={handleSave}>
            Save preferences
          </button>
          <button type="button" style={btnSecondaryStyle} onClick={handleAcceptAll}>
            {config.acceptAllLabel || 'Accept all'}
          </button>
          <button type="button" style={btnSecondaryStyle} onClick={handleRejectAll}>
            {config.rejectAllLabel || 'Reject all'}
          </button>
        </div>

        <p
          aria-live="polite"
          style={{ margin: '0.75rem 0 0', fontSize: '0.8125rem', color: 'var(--color-text-muted)', minHeight: '1.2em' }}
        >
          {saved
            ? 'Saved. Your preferences have been updated.'
            : storedAt
              ? `Last set on ${new Date(storedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`
              : 'You have not set any preferences on this device yet.'}
        </p>
      </section>
    </div>
  )
}
