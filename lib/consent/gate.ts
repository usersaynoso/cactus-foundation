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

export function notifyConsentChange(decision: ConsentDecision): void {
  if (typeof window !== 'undefined') {
    window.__cactusConsent = decision
  }
  for (const cb of listeners) cb(decision)
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
