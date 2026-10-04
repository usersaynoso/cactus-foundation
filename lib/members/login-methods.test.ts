import { describe, expect, it } from 'vitest'
import { memberLoginMethods } from './login-methods'

const ALL_ALLOWED = { passkey: true, password: true, magicLink: true }

describe('memberLoginMethods', () => {
  it('uses the email link only when the member has no enrolled credential', () => {
    expect(memberLoginMethods(ALL_ALLOWED, { hasPasskey: false, hasPassword: false })).toEqual({
      passkey: false,
      password: false,
      magicLink: true,
    })
  })

  it('does not offer the email link to a member with a password', () => {
    expect(memberLoginMethods(ALL_ALLOWED, { hasPasskey: false, hasPassword: true })).toEqual({
      passkey: false,
      password: true,
      magicLink: false,
    })
  })

  it('does not offer the email link to a member with a passkey', () => {
    expect(memberLoginMethods(ALL_ALLOWED, { hasPasskey: true, hasPassword: false })).toEqual({
      passkey: true,
      password: false,
      magicLink: false,
    })
  })

  it('offers both enrolled credentials without the email link', () => {
    expect(memberLoginMethods(ALL_ALLOWED, { hasPasskey: true, hasPassword: true })).toEqual({
      passkey: true,
      password: true,
      magicLink: false,
    })
  })

  it('keeps the email fallback when the enrolled method is switched off site-wide', () => {
    expect(
      memberLoginMethods(
        { passkey: false, password: false, magicLink: true },
        { hasPasskey: true, hasPassword: true }
      )
    ).toEqual({ passkey: false, password: false, magicLink: true })
  })
})
