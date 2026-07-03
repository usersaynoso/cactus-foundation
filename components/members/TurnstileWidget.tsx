'use client'

import { useEffect, useRef, useId } from 'react'

// Not declared as a `Window` global augmentation: modules/gazette's comment
// form already augments `Window.turnstile` with a narrower shape, and
// TypeScript requires all merged declarations of the same global to match
// exactly. Core code must not depend on (or collide with) what an optional
// module happens to declare, so this reads the property via a local cast.
type TurnstileGlobal = {
  render: (container: string | HTMLElement, options: Record<string, unknown>) => string
  remove: (widgetId: string) => void
}

function getTurnstile(): TurnstileGlobal | undefined {
  return (window as unknown as { turnstile?: TurnstileGlobal }).turnstile
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
let scriptPromise: Promise<void> | null = null

function loadTurnstileScript(): Promise<void> {
  if (getTurnstile()) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = SCRIPT_SRC
      script.async = true
      script.defer = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Failed to load Turnstile'))
      document.head.appendChild(script)
    })
  }
  return scriptPromise
}

type Props = {
  siteKey: string
  onVerify: (token: string) => void
  onExpire?: () => void
}

export default function TurnstileWidget({ siteKey, onVerify, onExpire }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const domId = `turnstile-${useId().replace(/[^a-zA-Z0-9]/g, '')}`

  useEffect(() => {
    let cancelled = false
    loadTurnstileScript()
      .then(() => {
        const turnstile = getTurnstile()
        if (cancelled || !containerRef.current || !turnstile) return
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: onVerify,
          'expired-callback': onExpire,
        })
      })
      .catch(() => {})

    return () => {
      cancelled = true
      const turnstile = getTurnstile()
      if (widgetIdRef.current && turnstile) {
        turnstile.remove(widgetIdRef.current)
      }
    }
    // Widget is mounted once per siteKey; onVerify/onExpire are read via the
    // render() callback options, not re-subscribed on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above
  }, [siteKey])

  return <div ref={containerRef} id={domId} />
}
