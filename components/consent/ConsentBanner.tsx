'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ConsentBannerConfig, ConsentDecision, ConsentCookiePayload } from '@/lib/consent/types'
import { notifyConsentChange, onConsentChange } from '@/lib/consent/gate'
import {
  CONSENT_COOKIE,
  buildDefaultDecision,
  readCookie,
  resolveCurrentDecision,
  saveConsentDecision,
  type ConsentAction,
} from '@/lib/consent/client'

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

  // Reopening the banner must show the choices the visitor actually made, not the
  // site defaults - offering to reset someone's settings the moment they ask to
  // review them is the one thing this panel must never do.
  const open = useCallback(() => {
    setDecision(resolveCurrentDecision(config).decision)
    setManaging(true)
    setVisible(true)
  }, [config])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.cactusConsent = {
        open,
        hasConsent: (cat) => window.__cactusConsent?.[cat] === true,
        onChange: onConsentChange,
      }
    }
  }, [open])

  useEffect(() => {
    if (!config.enabled) return

    const raw = readCookie(CONSENT_COOKIE)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- showing banner immediately when no cookie is intentional (no cascading risk)
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

  const noticeOnly = !config.categories.some((cat) => !cat.required)

  async function applyDecision(finalDecision: ConsentDecision, action: ConsentAction) {
    setVisible(false)
    setManaging(false)
    await saveConsentDecision(config, finalDecision, action)
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

  function handleDismiss() {
    const required: ConsentDecision = {}
    for (const cat of config.categories) required[cat.key] = true
    applyDecision(required, 'acknowledge')
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

      {managing && !noticeOnly && (
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
        {noticeOnly ? (
          <button style={btnPrimaryStyle} onClick={handleDismiss}>
            {config.dismissLabel || 'Got it'}
          </button>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  )

  if (isModal) {
    return <div style={overlayStyle}>{content}</div>
  }

  return content
}
