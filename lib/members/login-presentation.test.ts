import { describe, expect, it } from 'vitest'
import { memberLoginDestination, memberTwoFactorMessage } from './login-presentation'

describe('memberLoginDestination', () => {
  it('sends a member to their account when the block has no custom destination', () => {
    expect(memberLoginDestination('', '/account')).toBe('/account')
  })

  it('keeps an explicitly configured internal destination', () => {
    expect(memberLoginDestination('/members/welcome', '/account')).toBe('/members/welcome')
  })
})

describe('memberTwoFactorMessage', () => {
  it('says that an email code was sent and where it went', () => {
    expect(memberTwoFactorMessage('EMAIL', 'member@example.com')).toBe(
      "We've sent a sign-in code to member@example.com. It expires in 10 minutes.",
    )
  })

  it('keeps the masked destination in the text-message confirmation', () => {
    expect(memberTwoFactorMessage('SMS', 'member@example.com', '+44 •••• 1234')).toBe(
      "We've sent a code by text message to +44 •••• 1234.",
    )
  })

  it('does not claim that an authenticator code was sent', () => {
    expect(memberTwoFactorMessage('AUTHENTICATOR_APP', 'member@example.com')).toBeNull()
  })
})
