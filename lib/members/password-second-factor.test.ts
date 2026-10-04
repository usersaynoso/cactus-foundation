import { describe, expect, it } from 'vitest'
import {
  memberPasswordSecondFactor,
  type MemberSecondFactorCandidate,
} from './password-second-factor'

function factor(
  method: MemberSecondFactorCandidate['method'],
  overrides: Partial<MemberSecondFactorCandidate> = {}
): MemberSecondFactorCandidate {
  return {
    id: method.toLowerCase(),
    method,
    verified: true,
    secretEncrypted: method === 'AUTHENTICATOR_APP' ? 'encrypted' : null,
    phoneEncrypted: method === 'SMS' ? 'encrypted-phone' : null,
    lastStep: null,
    ...overrides,
  }
}

describe('memberPasswordSecondFactor', () => {
  it('uses an email code when no method has been configured', () => {
    expect(memberPasswordSecondFactor([], true)).toMatchObject({ id: null, method: 'EMAIL' })
  })

  it('cannot invent an email fallback when email delivery is unavailable', () => {
    expect(memberPasswordSecondFactor([], false)).toBeNull()
  })

  it('prefers a verified authenticator app over the built-in email fallback', () => {
    expect(memberPasswordSecondFactor([factor('AUTHENTICATOR_APP')], true)).toMatchObject({
      id: 'authenticator_app',
      method: 'AUTHENTICATOR_APP',
    })
  })

  it('prefers a verified SMS factor when one has a number', () => {
    expect(
      memberPasswordSecondFactor([factor('EMAIL'), factor('AUTHENTICATOR_APP'), factor('SMS')], true)
    ).toMatchObject({ id: 'sms', method: 'SMS' })
  })

  it('ignores unverified and incomplete configured factors', () => {
    expect(
      memberPasswordSecondFactor(
        [
          factor('AUTHENTICATOR_APP', { verified: false }),
          factor('SMS', { phoneEncrypted: null }),
        ],
        true
      )
    ).toMatchObject({ id: null, method: 'EMAIL' })
  })
})
