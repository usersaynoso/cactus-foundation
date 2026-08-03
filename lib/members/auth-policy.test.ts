import { describe, it, expect } from 'vitest'
import { parseMembersConfig, type MembersConfig } from './config'
import { outstandingAuthSetup, newMembersCanSignIn, hasAnyAuthMethod } from './auth-policy'

function configWith(policies: Partial<MembersConfig['authMethodPolicies']>): MembersConfig {
  return parseMembersConfig({ authMethodPolicies: { PASSKEY: 'OFF', MAGIC_LINK: 'OFF', PASSWORD: 'OFF', ...policies } })
}

const NOTHING_HELD = { hasPasskey: false, hasPassword: false, hasTwoFactor: false }

describe('outstandingAuthSetup', () => {
  it('asks for nothing when no method is required', () => {
    const config = configWith({ PASSKEY: 'OPTIONAL', MAGIC_LINK: 'OPTIONAL', PASSWORD: 'OPTIONAL' })
    expect(outstandingAuthSetup(config, NOTHING_HELD)).toEqual([])
  })

  it('asks for a required passkey the member does not have', () => {
    const config = configWith({ PASSKEY: 'REQUIRED', MAGIC_LINK: 'OPTIONAL' })
    expect(outstandingAuthSetup(config, NOTHING_HELD)).toEqual(['PASSKEY'])
    expect(outstandingAuthSetup(config, { ...NOTHING_HELD, hasPasskey: true })).toEqual([])
  })

  // A password with no second factor cannot sign anyone in - the password login
  // route refuses outright - so counting it as done would strand the member at
  // the sign-in screen with a credential the site had told them was enough.
  it('does not count a password without a second factor as done', () => {
    const config = configWith({ PASSWORD: 'REQUIRED', MAGIC_LINK: 'OPTIONAL' })
    expect(outstandingAuthSetup(config, { ...NOTHING_HELD, hasPassword: true })).toEqual(['PASSWORD'])
    expect(outstandingAuthSetup(config, { hasPasskey: false, hasPassword: true, hasTwoFactor: true })).toEqual([])
  })

  it('asks for both when both are required', () => {
    const config = configWith({ PASSKEY: 'REQUIRED', PASSWORD: 'REQUIRED' })
    expect(outstandingAuthSetup(config, NOTHING_HELD)).toEqual(['PASSKEY', 'PASSWORD'])
  })
})

describe('newMembersCanSignIn', () => {
  it('needs the email sign-in link, since the rest are enrolled from inside an account', () => {
    expect(newMembersCanSignIn(configWith({ MAGIC_LINK: 'OPTIONAL' }), true)).toBe(true)
    expect(newMembersCanSignIn(configWith({ MAGIC_LINK: 'OFF', PASSKEY: 'REQUIRED', PASSWORD: 'REQUIRED' }), true)).toBe(false)
  })

  it('is false when the site cannot send email, however the link is set', () => {
    expect(newMembersCanSignIn(configWith({ MAGIC_LINK: 'OPTIONAL' }), false)).toBe(false)
  })
})

describe('hasAnyAuthMethod', () => {
  it('is false only when every method is off', () => {
    expect(hasAnyAuthMethod(configWith({}))).toBe(false)
    expect(hasAnyAuthMethod(configWith({ PASSKEY: 'OPTIONAL' }))).toBe(true)
  })
})

// Sites configured before sign-in methods became one control each stored an
// allowedAuthMethods array alongside a separate passwordsEnabled boolean.
describe('reading a config written under the old two-switch shape', () => {
  it('carries the allowed list across as optional', () => {
    const config = parseMembersConfig({ allowedAuthMethods: ['PASSKEY', 'MAGIC_LINK'], passwordsEnabled: false })
    expect(config.authMethodPolicies).toEqual({ PASSKEY: 'OPTIONAL', MAGIC_LINK: 'OPTIONAL', PASSWORD: 'OFF' })
  })

  // Both switches had to agree before passwords were offered, so a site listing
  // PASSWORD with the boolean off was not offering them, and must not start.
  it('leaves passwords off when only one of the old pair said yes', () => {
    expect(parseMembersConfig({ allowedAuthMethods: ['PASSWORD'], passwordsEnabled: false }).authMethodPolicies.PASSWORD).toBe('OFF')
    expect(parseMembersConfig({ allowedAuthMethods: [], passwordsEnabled: true }).authMethodPolicies.PASSWORD).toBe('OFF')
    expect(parseMembersConfig({ allowedAuthMethods: ['PASSWORD'], passwordsEnabled: true }).authMethodPolicies.PASSWORD).toBe('OPTIONAL')
  })

  it('never marks anything required, since the old shape could not express it', () => {
    const config = parseMembersConfig({ allowedAuthMethods: ['PASSKEY', 'MAGIC_LINK', 'PASSWORD'], passwordsEnabled: true })
    expect(Object.values(config.authMethodPolicies)).not.toContain('REQUIRED')
  })

  it('prefers the new shape when both are present', () => {
    const config = parseMembersConfig({
      allowedAuthMethods: [],
      passwordsEnabled: false,
      authMethodPolicies: { PASSKEY: 'REQUIRED', MAGIC_LINK: 'OPTIONAL', PASSWORD: 'OFF' },
    })
    expect(config.authMethodPolicies.PASSKEY).toBe('REQUIRED')
  })
})

// One bad value must not drop the whole members config back to defaults, which
// would switch the members system off rather than mis-set a single method.
describe('unrecognised stored values', () => {
  it('falls back per method and leaves the rest of the config alone', () => {
    const config = parseMembersConfig({
      enabled: true,
      authMethodPolicies: { PASSKEY: 'SOMETIMES', MAGIC_LINK: 'REQUIRED', PASSWORD: 'REQUIRED' },
    })
    expect(config.enabled).toBe(true)
    expect(config.authMethodPolicies.PASSKEY).toBe('OPTIONAL')
    // MAGIC_LINK has no REQUIRED state of its own to fall back from.
    expect(config.authMethodPolicies.MAGIC_LINK).toBe('OPTIONAL')
    expect(config.authMethodPolicies.PASSWORD).toBe('REQUIRED')
  })
})
