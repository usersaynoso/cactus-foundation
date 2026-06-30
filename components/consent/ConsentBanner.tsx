'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ConsentBannerConfig, ConsentDecision, ConsentCookiePayload } from '@/lib/consent/types'
import { notifyConsentChange } from '@/lib/consent/gate'

const CONSENT_COOKIE = 'cactus-consent'
const CONSENT_ID_COOKIE = 'cactus-consent-id'

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.split(';').find((s) => s.trim().startsWith(`${name}=`))
  if (!match) return null
  return decodeURIComponent(match.trim().slice(name.length + 1))
}

function writeCookie(name: string, value: string, maxAgeDays: number): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeDays * 86400}; SameSite=Lax`
}

function getOrCreateConsentId(): string {
  const existing = readCookie(CONSENT_ID_COOKIE)
  if (existing) return existing
  const id = crypto.randomUUID()
  writeCookie(CONSENT_ID_COOKIE, id, 365 * 2)
  return id
}

function buildDefaultDecision(categories: ConsentBannerConfig['categories']): ConsentDecision {
  const d: ConsentDecision = {}
  for (const cat of categories) d[cat.key] = cat.required ? true : cat.defaultOn
  return d
}

type Props = {
  config: ConsentBannerConfig
  privacyPolicyUrl?: string
}

export default function ConsentBanner({ config, privacyPolicyUrl }: Props) {
  const [visible, setVisible] = useState(false)
  const [managing, setManaging] = useState(false)
  const [decision, setDecision] = useState<ConsentDecision>(() =>
    buildDefaultDecision(config.categories)
  )

  const open = useCallback(() => {
    setManaging(true)
    setVisible(true)
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.cactusConsent = {
        open,
        hasConsent: (cat) => window.__cactusConsent?.[cat] === true,
        onChange: (cb) => {
          // Thin wrapper - real subscription is in gate.ts
          const { onConsentChange } = require('@/lib/consent/gate')
          return onConsentChange(cb)
        },
      }
    }
  }, [open])

  useEffect(() => {
    if (!config.enabled) return

    const raw = readCookie(CONSENT_COOKIE)
    if (!raw) { setVisible(true); return }

    let payload: ConsentCookiePayload | null = null
    try { payload = JSON.parse(raw) } catch { /* ignore */ }

    if (!payload) { setVisible(true); return }

    if (payload.version < config.categoriesVersion) {
      setDecision(buildDefaultDecision(config.categories))
      setVisible(true)
      return
    }

    if (config.reConsentDays > 0) {
      const ageMs = Date.now() - new Date(payload.at).getTime()
      if (ageMs > config.reConsentDays * 86400 * 1000) {
        setDecision(buildDefaultDecision(config.categories))
        setVisible(true)
        return
      }
    }

    // Existing consent is current - hydrate window.__cactusConsent
    notifyConsentChange({ necessary: true, ...payload.decision })
  }, [config])

  async function applyDecision(finalDecision: ConsentDecision, action: 'accept_all' | 'reject_all' | 'custom' | 'withdraw') {
    const consentId = getOrCreateConsentId()

    const payload: ConsentCookiePayload = {
      version: config.categoriesVersion,
      decision: finalDecision,
      at: new Date().toISOString(),
    }
    writeCookie(CONSENT_COOKIE, JSON.stringify(payload), config.reConsentDays || 365)

    notifyConsentChange({ necessary: true, ...finalDecision })
    setVisible(false)
    setManaging(false)

    try {
      await fetch('/api/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consentId,
          action,
          decision: finalDecision,
          categoriesVersion: config.categoriesVersion,
        }),
      })
    } catch { /* 429 or network error - cookie state is source of truth for UI */ }
  }

  function handleAcceptAll() {
    const all: ConsentDecision = {}
    for (const cat of config.categories) all[cat.key] = true
    applyDecision(all, 'accept_all')
  }

  function handleRejectAll() {
    const none: ConsentDecision = {}
    for (const cat of config.categories) none[cat.key] = cat.required ? true : false
    applyDecision(none, 'reject_all')
  }

  function handleSaveManaged() {
    applyDecision(decision, 'custom')
  }

  function resolveBody(text: string): React.ReactNode {
    if (!text.includes('{privacyPolicy}')) return text
    const parts = text.split('{privacyPolicy}')
    return (
      <>
        {parts[0]}
        {privacyPolicyUrl
          ? <a href={privacyPolicyUrl} style={{ color: 'var(--color-primary)' }}>privacy policy</a>
          : 'privacy policy'
        }
        {parts[1]}
      </>
    )
  }

  if (!config.enabled || !visible) return null

  const isModal = config.style === 'modal'

  const overlayStyle: React.CSSProperties = isModal ? {
    position: 'fixed', inset: 0, zIndex: 9998,
    background: 'var(--color-overlay)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 'var(--space-4)',
  } : {}

  const bannerStyle: React.CSSProperties = isModal ? {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-lg)',
    padding: 'var(--space-6)',
    maxWidth: '480px',
    width: '100%',
    fontFamily: 'var(--font-sans)',
    zIndex: 9999,
  } : {
    position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
    background: 'var(--color-surface)',
    borderTop: '1px solid var(--color-border)',
    boxShadow: 'var(--shadow-lg)',
    padding: 'var(--space-4) var(--space-6)',
    fontFamily: 'var(--font-sans)',
  }

  const titleStyle: React.CSSProperties = {
    margin: '0 0 var(--space-2)',
    fontSize: 'var(--text-base)',
    fontWeight: 600,
    color: 'var(--color-text)',
  }

  const bodyStyle: React.CSSProperties = {
    margin: '0 0 var(--space-4)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5,
  }

  const btnPrimaryStyle: React.CSSProperties = {
    background: 'var(--color-primary)',
    color: 'var(--color-on-primary)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--space-2) var(--space-4)',
    fontSize: 'var(--text-sm)',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
  }

  const btnSecondaryStyle: React.CSSProperties = {
    background: 'transparent',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--space-2) var(--space-4)',
    fontSize: 'var(--text-sm)',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
  }

  const btnLinkStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: 'var(--color-primary)',
    fontSize: 'var(--text-sm)',
    cursor: 'pointer',
    padding: 0,
    fontFamily: 'var(--font-sans)',
  }

  const content = (
    <div style={bannerStyle}>
      <h2 style={titleStyle}>{config.title}</h2>
      <p style={bodyStyle}>{resolveBody(config.body)}</p>

      {managing && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          {config.categories.map((cat) => (
            <label
              key={cat.key}
              style={{
                display: 'flex',
                gap: 'var(--space-3)',
                alignItems: 'flex-start',
                padding: 'var(--space-3) 0',
                borderBottom: '1px solid var(--color-border)',
                cursor: cat.required ? 'default' : 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={cat.required ? true : (decision[cat.key] ?? cat.defaultOn)}
                disabled={cat.required}
                onChange={(e) => {
                  if (cat.required) return
                  setDecision((prev) => ({ ...prev, [cat.key]: e.target.checked }))
                }}
                style={{ marginTop: 2, flexShrink: 0 }}
              />
              <span>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text)', display: 'block' }}>
                  {cat.label}
                  {cat.required && (
                    <span style={{ marginLeft: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 400 }}>
                      Always on
                    </span>
                  )}
                </span>
                {cat.description && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', display: 'block', marginTop: 2 }}>
                    {cat.description}
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
        <button style={btnPrimaryStyle} onClick={handleAcceptAll}>
          {config.acceptAllLabel}
        </button>
        <button style={btnSecondaryStyle} onClick={handleRejectAll}>
          {config.rejectAllLabel}
        </button>
        {managing ? (
          <button style={btnSecondaryStyle} onClick={handleSaveManaged}>
            Save preferences
          </button>
        ) : (
          <button style={btnLinkStyle} onClick={() => setManaging(true)}>
            {config.manageLabel}
          </button>
        )}
      </div>
    </div>
  )

  if (isModal) {
    return <div style={overlayStyle}>{content}</div>
  }

  return content
}
