import { describe, it, expect } from 'vitest'
import { isPublicMemberPath } from './paths'

// The account layout gates every member-area page on a session. These are the
// pages that have to stay open, because they are how a visitor gets a session:
// gating them sent /login to /login, wrapping the whole previous URL in the
// next one's ?redirect= each hop until the browser refused to load it.
describe('isPublicMemberPath', () => {
  it('accepts the signed-out pages', () => {
    expect(isPublicMemberPath('/account/login', '/account')).toBe(true)
    expect(isPublicMemberPath('/account/register', '/account')).toBe(true)
    expect(isPublicMemberPath('/account/verify-email', '/account')).toBe(true)
  })

  it('ignores the query string', () => {
    expect(isPublicMemberPath('/account/login?redirect=%2Fshop', '/account')).toBe(true)
    expect(isPublicMemberPath('/account/register?email=a%40b.co', '/account')).toBe(true)
  })

  it('tolerates a trailing slash', () => {
    expect(isPublicMemberPath('/account/login/', '/account')).toBe(true)
  })

  it('gates the member pages themselves', () => {
    expect(isPublicMemberPath('/account', '/account')).toBe(false)
    expect(isPublicMemberPath('/account/profile', '/account')).toBe(false)
    expect(isPublicMemberPath('/account/security', '/account')).toBe(false)
    expect(isPublicMemberPath('/account/danger-zone', '/account')).toBe(false)
  })

  it('follows a custom MEMBER_AREA_PATH', () => {
    expect(isPublicMemberPath('/members/login', '/members')).toBe(true)
    expect(isPublicMemberPath('/account/login', '/members')).toBe(false)
  })

  it('leaves paths outside the member area alone', () => {
    // A site is free to have its own /login page, and the shop's gated pages
    // are legitimate post-sign-in destinations.
    expect(isPublicMemberPath('/login', '/account')).toBe(false)
    expect(isPublicMemberPath('/accounts-payable/login', '/account')).toBe(false)
    expect(isPublicMemberPath('/shop/account/orders', '/account')).toBe(false)
  })

  it('does not match a page whose name merely starts with a public one', () => {
    expect(isPublicMemberPath('/account/logins', '/account')).toBe(false)
    expect(isPublicMemberPath('/account/registered-devices', '/account')).toBe(false)
  })
})
