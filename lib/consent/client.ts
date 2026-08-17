'use client'

import type { ConsentBannerConfig, ConsentCookiePayload, ConsentDecision } from './types'
import { notifyConsentChange } from './gate'

// The banner and the on-page preferences panel are two front ends onto one
// decision, so the cookie names, the payload shape and the audit POST all live
// here rather than in whichever component happened to need them first. A second
// copy of this logic is exactly how the two surfaces would drift apart.
export const CONSENT_COOKIE = 'cactus-consent'
export const CONSENT_ID_COOKIE = 'cactus-consent-id'

export type ConsentAction = 'accept_all' | 'reject_all' | 'custom' | 'withdraw' | 'acknowledge'

export function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.split(';').find((s) => s.trim().startsWith(`${name}=`))
  if (!match) return null
  return decodeURIComponent(match.trim().slice(name.length + 1))
}

export function writeCookie(name: string, value: string, maxAgeDays: number): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeDays * 86400}; SameSite=Lax`
}

export function getOrCreateConsentId(): string {
  const existing = readCookie(CONSENT_ID_COOKIE)
  if (existing) return existing
  const id = crypto.randomUUID()
  writeCookie(CONSENT_ID_COOKIE, id, 365 * 2)
  return id
}

export function readStoredConsent(): ConsentCookiePayload | null {
  const raw = readCookie(CONSENT_COOKIE)
  if (!raw) return null
  try {
    const payload = JSON.parse(raw) as ConsentCookiePayload
    if (!payload || typeof payload !== 'object' || !payload.decision) return null
    return payload
  } catch {
    return null
  }
}

export function buildDefaultDecision(categories: ConsentBannerConfig['categories']): ConsentDecision {
  const d: ConsentDecision = {}
  for (const cat of categories) d[cat.key] = cat.required ? true : cat.defaultOn
  return d
}

// The decision the visitor is currently living under: their stored choice where
// it still matches the categories on offer, the configured defaults otherwise.
// A stored decision from an older categories version is deliberately ignored -
// the same rule the banner uses to decide it must ask again.
export function resolveCurrentDecision(config: ConsentBannerConfig): {
  decision: ConsentDecision
  storedAt: string | null
} {
  const defaults = buildDefaultDecision(config.categories)
  const stored = readStoredConsent()
  if (!stored || stored.version !== config.categoriesVersion) {
    return { decision: defaults, storedAt: null }
  }
  return { decision: { ...defaults, ...stored.decision }, storedAt: stored.at }
}

// Writes the cookie, tells every consent-gated script on the page, then records
// the choice for audit. The cookie is the source of truth for the UI, so a failed
// or rate-limited POST never blocks the visitor's decision from taking effect.
export async function saveConsentDecision(
  config: ConsentBannerConfig,
  decision: ConsentDecision,
  action: ConsentAction
): Promise<void> {
  const consentId = getOrCreateConsentId()

  const payload: ConsentCookiePayload = {
    version: config.categoriesVersion,
    decision,
    at: new Date().toISOString(),
  }
  writeCookie(CONSENT_COOKIE, JSON.stringify(payload), config.reConsentDays || 365)

  notifyConsentChange({ necessary: true, ...decision })

  try {
    await fetch('/api/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        consentId,
        action,
        decision,
        categoriesVersion: config.categoriesVersion,
      }),
    })
  } catch { /* 429 or network error - cookie state is source of truth for UI */ }
}
