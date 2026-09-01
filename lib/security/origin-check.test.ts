import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { originMismatch } from '@/lib/security/origin-check'

const SITE = 'https://deskwell.co.uk'

function req(opts: { method?: string; origin?: string; cookie?: string; path?: string } = {}): NextRequest {
  const headers = new Headers()
  if (opts.origin) headers.set('origin', opts.origin)
  if (opts.cookie) headers.set('cookie', opts.cookie)
  return new NextRequest(`${SITE}${opts.path ?? '/api/m/some-module/webhook'}`, {
    method: opts.method ?? 'POST',
    headers,
  })
}

describe('originMismatch', () => {
  it('lets a same-origin cookie-bearing POST through', () => {
    expect(originMismatch(req({ origin: SITE, cookie: 'cactus_session=abc' }))).toBe(false)
  })

  it('rejects a cross-origin POST that carries a cookie', () => {
    expect(originMismatch(req({ origin: 'https://evil.example', cookie: 'cactus_session=abc' }))).toBe(true)
  })

  // The whole point. GoCardless's webhook service sends an Origin of its own on
  // every delivery and no cookies at all; before this, that combination was
  // refused with 403 before the module route ever saw it, and payments that had
  // genuinely been taken never confirmed. Any other machine caller that happens
  // to send an Origin (Stripe, Square, Twilio, Brevo, Chatwoot - every module
  // webhook lives under /api/m/*, none of which ALWAYS_PASS covers) was one
  // vendor decision away from the same silence.
  it('lets a cookieless cross-origin POST through, which is what a webhook is', () => {
    expect(originMismatch(req({ origin: 'https://api.gocardless.com' }))).toBe(false)
  })

  it('still rejects a cross-origin POST carrying any cookie, not just the session one', () => {
    expect(originMismatch(req({ origin: 'https://evil.example', cookie: 'anything=1' }))).toBe(true)
  })

  it('ignores requests with no Origin header at all', () => {
    expect(originMismatch(req({ cookie: 'cactus_session=abc' }))).toBe(false)
  })

  it('never blocks safe methods', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      expect(originMismatch(req({ method, origin: 'https://evil.example', cookie: 'cactus_session=abc' }))).toBe(false)
    }
  })
})
