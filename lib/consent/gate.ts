'use client'

import type { ConsentDecision } from './types'

declare global {
  interface Window {
    __cactusConsent: ConsentDecision
    cactusConsent: {
      open: () => void
      hasConsent: (category: string) => boolean
      onChange: (cb: (decision: ConsentDecision) => void) => () => void
    }
  }
}

const listeners = new Set<(decision: ConsentDecision) => void>()

// Modules live in their own bundle and cannot count on sharing this file's
// listener Set, so every decision is also announced as a plain DOM event.
// That is the seam module code should listen on.
export const CONSENT_CHANGE_EVENT = 'cactus:consent-change'

export function notifyConsentChange(decision: ConsentDecision): void {
  if (typeof window !== 'undefined') {
    window.__cactusConsent = decision
  }
  for (const cb of listeners) cb(decision)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<ConsentDecision>(CONSENT_CHANGE_EVENT, { detail: decision }))
  }
}

export function hasConsent(category: string): boolean {
  if (typeof window === 'undefined') return false
  return window.__cactusConsent?.[category] === true
}

export function onConsentChange(cb: (decision: ConsentDecision) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function loadIfConsented(category: string, fn: () => void): void {
  if (hasConsent(category)) {
    fn()
  } else {
    const unsub = onConsentChange((decision) => {
      if (decision[category]) {
        fn()
        unsub()
      }
    })
  }
}
