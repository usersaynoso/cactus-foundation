import { describe, expect, it } from 'vitest'
import { buildAppleAppSiteAssociation, parseIosWebCredentialAppIds } from './ios-webcredentials'

describe('parseIosWebCredentialAppIds', () => {
  it('accepts TeamID.bundleId entries', () => {
    expect(parseIosWebCredentialAppIds('5F5MV5H6F7.co.uk.deskwell.app')).toEqual([
      '5F5MV5H6F7.co.uk.deskwell.app',
    ])
  })

  it('rejects malformed ids', () => {
    expect(parseIosWebCredentialAppIds('not-an-app-id,5F5MV5H6F7.co.uk.deskwell.app')).toEqual([
      '5F5MV5H6F7.co.uk.deskwell.app',
    ])
  })
})

describe('buildAppleAppSiteAssociation', () => {
  it('returns null when env is empty', () => {
    const prev = process.env.IOS_WEBCREDENTIAL_APP_IDS
    delete process.env.IOS_WEBCREDENTIAL_APP_IDS
    expect(buildAppleAppSiteAssociation()).toBeNull()
    if (prev !== undefined) process.env.IOS_WEBCREDENTIAL_APP_IDS = prev
  })
})
