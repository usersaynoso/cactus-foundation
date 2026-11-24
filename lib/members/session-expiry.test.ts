import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/config/env', () => ({ getSessionSecret: () => 'test-secret' }))
vi.mock('@/lib/members/config', () => ({ getMembersConfigCached: vi.fn() }))

import { isMemberSessionLive, memberTrustedBrowserExpiresAt } from './session-core'

const DAY = 24 * 60 * 60 * 1000
const now = new Date('2026-11-24T12:00:00Z')
const ago = (days: number) => new Date(now.getTime() - days * DAY)
const ahead = (days: number) => new Date(now.getTime() + days * DAY)

describe('isMemberSessionLive', () => {
  it('is live inside both the stored expiry and the setting', () => {
    expect(isMemberSessionLive({ lastActiveAt: ago(2), expiresAt: ahead(28) }, 30, now)).toBe(true)
  })

  it('ends at the stored expiry', () => {
    expect(isMemberSessionLive({ lastActiveAt: ago(1), expiresAt: ago(0.01) }, 30, now)).toBe(false)
  })

  // Shortening "Session duration" must bite straight away, not once each
  // session's old 30-day expiry runs out.
  it('ends when the current setting says so, counted from the last visit', () => {
    expect(isMemberSessionLive({ lastActiveAt: ago(3), expiresAt: ahead(27) }, 2, now)).toBe(false)
    expect(isMemberSessionLive({ lastActiveAt: ago(1), expiresAt: ahead(29) }, 2, now)).toBe(true)
  })
})

describe('memberTrustedBrowserExpiresAt', () => {
  it('counts from the day the browser was trusted', () => {
    expect(memberTrustedBrowserExpiresAt(ago(10), 30)).toEqual(ahead(20))
  })

  it('follows the current setting for browsers already trusted', () => {
    expect(memberTrustedBrowserExpiresAt(ago(10), 7).getTime()).toBeLessThan(now.getTime())
    expect(memberTrustedBrowserExpiresAt(ago(10), 60)).toEqual(ahead(50))
  })
})
