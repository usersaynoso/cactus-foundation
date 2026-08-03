import { describe, it, expect } from 'vitest'
import { isAccountSectionEnabled, parseMembersConfig, registrationPasswordPolicy, type MembersConfig } from './config'

function configWith(raw: Record<string, unknown>): MembersConfig {
  return parseMembersConfig(raw)
}

describe('registrationPasswordPolicy', () => {
  it('offers the password box while passwords are optional', () => {
    const config = configWith({ authMethodPolicies: { PASSWORD: 'OPTIONAL' } })
    expect(registrationPasswordPolicy(config)).toBe('OPTIONAL')
  })

  // The point of the setting: passwords stay available, the sign-up form just
  // stops asking, and the member adds one later from their account.
  it('drops the password box when the site has chosen not to ask at sign-up', () => {
    const config = configWith({
      authMethodPolicies: { PASSWORD: 'OPTIONAL' },
      registrationCollectPassword: false,
    })
    expect(registrationPasswordPolicy(config)).toBe('OFF')
  })

  // An account with no password is unusable under REQUIRED, so the form has to
  // ask however the toggle is set.
  it('still asks when a password is required', () => {
    const config = configWith({
      authMethodPolicies: { PASSWORD: 'REQUIRED' },
      registrationCollectPassword: false,
    })
    expect(registrationPasswordPolicy(config)).toBe('REQUIRED')
  })

  it('stays off when passwords are off, toggle or no toggle', () => {
    expect(registrationPasswordPolicy(configWith({ authMethodPolicies: { PASSWORD: 'OFF' } }))).toBe('OFF')
    expect(
      registrationPasswordPolicy(
        configWith({ authMethodPolicies: { PASSWORD: 'OFF' }, registrationCollectPassword: true })
      )
    ).toBe('OFF')
  })

  // Sites saved before the setting existed have no such key stored, and must
  // keep asking exactly as they did.
  it('defaults to asking, so stored rows written before the setting are unchanged', () => {
    const config = configWith({ authMethodPolicies: { PASSWORD: 'OPTIONAL' } })
    expect(config.registrationCollectPassword).toBe(true)
    expect(registrationPasswordPolicy(config)).toBe('OPTIONAL')
  })
})

describe('isAccountSectionEnabled', () => {
  it('is on by default, so no stored row loses a tab it already had', () => {
    const config = configWith({})
    expect(isAccountSectionEnabled(config, 'profile')).toBe(true)
    expect(isAccountSectionEnabled(config, 'dangerZone')).toBe(true)
  })

  // Switching one off must not take the others with it - the object has its own
  // per-key defaults, and a partial stored value is the normal case.
  it('switches off only the section named', () => {
    const config = configWith({ accountSectionsEnabled: { profile: false } })
    expect(isAccountSectionEnabled(config, 'profile')).toBe(false)
    expect(isAccountSectionEnabled(config, 'security')).toBe(true)
    expect(isAccountSectionEnabled(config, 'activity')).toBe(true)
  })
})
