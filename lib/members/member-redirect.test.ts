import { describe, expect, it } from 'vitest'
import { carriedMemberRedirect, resolveMemberRedirect, verifiedDestination } from './member-redirect'

// The sign-in page, the register page, the verification link and the page that
// spends it all decide "where does this member go next" from a visitor-supplied
// ?redirect=. They share one rule so a hand-off that works for sign-in works for
// sign-up too, and an escape refused by one is refused by all.

const APP_CONNECT = '/api/m/tg-finance/v1/auth/app-connect?state=S&code_challenge=C&redirect_uri=tgfinance%3A%2F%2Fauth'

describe('resolveMemberRedirect', () => {
  it('keeps a same-site path, the module hand-off included', () => {
    expect(resolveMemberRedirect(APP_CONNECT, '/account')).toBe(APP_CONNECT)
    expect(resolveMemberRedirect('/shop/basket', '/account')).toBe('/shop/basket')
  })

  it('falls back to the member area with nothing to go to', () => {
    expect(resolveMemberRedirect(undefined, '/account')).toBe('/account')
    expect(resolveMemberRedirect('', '/account')).toBe('/account')
  })

  it('will not send a member back to a signed-out page', () => {
    for (const loop of ['/account/login', '/account/register?redirect=%2Fx', '/account/verify-email?token=t']) {
      expect(resolveMemberRedirect(loop, '/account')).toBe('/account')
    }
  })

  it('refuses every way off the site', () => {
    for (const bad of [
      'https://evil.test/',
      '//evil.test',
      '/\\evil.test',
      '/\t/evil.test',
      'javascript:alert(1)',
      'tgfinance://auth',
      '/api/m/tg-finance/v1/auth/app-connect?redirect_uri=tgfinance://auth',
    ]) {
      expect(resolveMemberRedirect(bad, '/account'), JSON.stringify(bad)).toBe('/account')
    }
  })
})

describe('carriedMemberRedirect', () => {
  it('carries nothing when the visitor brought nothing', () => {
    expect(carriedMemberRedirect(undefined, '/account')).toBeUndefined()
    expect(carriedMemberRedirect('', '/account')).toBeUndefined()
  })

  it('carries the resolved value, never the raw one', () => {
    expect(carriedMemberRedirect(APP_CONNECT, '/account')).toBe(APP_CONNECT)
    expect(carriedMemberRedirect('https://evil.test/', '/account')).toBe('/account')
  })
})

describe('verifiedDestination', () => {
  it('is the account with its welcome pill when there is no redirect', () => {
    expect(verifiedDestination({ signedIn: true, accountHref: '/account' })).toEqual({ href: '/account', flash: true })
  })

  it('goes to the redirect once the member is signed in, without a pill left behind for later', () => {
    expect(verifiedDestination({ signedIn: true, redirectHref: APP_CONNECT, accountHref: '/account' })).toEqual({
      href: APP_CONNECT,
      flash: false,
    })
  })

  it('keeps the pill for a redirect inside the member area, where it will be shown', () => {
    expect(verifiedDestination({ signedIn: true, redirectHref: '/account/security', accountHref: '/account' })).toEqual({
      href: '/account/security',
      flash: true,
    })
  })

  // Waiting for approval, nobody is signed in, and the hand-off would only bounce
  // them to the sign-in page to be told the same thing. The account page says it.
  it('ignores the redirect when verifying did not sign the member in', () => {
    expect(verifiedDestination({ signedIn: false, redirectHref: APP_CONNECT, accountHref: '/account' })).toEqual({
      href: '/account',
      flash: true,
    })
  })

  it('re-checks a redirect handed to it, rather than trusting the caller', () => {
    expect(verifiedDestination({ signedIn: true, redirectHref: '//evil.test', accountHref: '/account' })).toEqual({
      href: '/account',
      flash: true,
    })
  })
})
