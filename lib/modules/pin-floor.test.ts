import { describe, expect, it } from 'vitest'
import { applyPinFloor, formatHeldPins } from './pin-floor'

const mod = (name: string, version: string) => ({ name, repoUrl: `https://github.com/x/${name}`, version })

describe('applyPinFloor', () => {
  it('holds a pin when the desired version is behind what git already pins', () => {
    const result = applyPinFloor([mod('shop-variations', 'v0.1.94')], [{ name: 'shop-variations', version: 'v0.1.95' }])
    expect(result.entries).toEqual([mod('shop-variations', 'v0.1.95')])
    expect(result.held).toEqual([{ name: 'shop-variations', wanted: 'v0.1.94', kept: 'v0.1.95' }])
  })

  it('passes the desired version through when it is ahead or equal', () => {
    const ahead = applyPinFloor([mod('shop', 'v0.1.130')], [{ name: 'shop', version: 'v0.1.129' }])
    expect(ahead.entries).toEqual([mod('shop', 'v0.1.130')])
    expect(ahead.held).toEqual([])

    const equal = applyPinFloor([mod('shop', 'v0.1.130')], [{ name: 'shop', version: 'v0.1.130' }])
    expect(equal.entries).toEqual([mod('shop', 'v0.1.130')])
    expect(equal.held).toEqual([])
  })

  it('passes desired through untouched when the registry has no entry or no pin for it', () => {
    const unknown = applyPinFloor([mod('twilio', 'v0.1.22')], [])
    expect(unknown.entries).toEqual([mod('twilio', 'v0.1.22')])

    const unpinned = applyPinFloor([mod('twilio', 'v0.1.22')], [{ name: 'twilio' }])
    expect(unpinned.entries).toEqual([mod('twilio', 'v0.1.22')])
  })

  it('does not resurrect an entry the desired set drops', () => {
    const result = applyPinFloor([mod('shop', 'v0.1.130')], [
      { name: 'shop', version: 'v0.1.130' },
      { name: 'contact-form', version: 'v0.1.30' },
    ])
    expect(result.entries.map((e) => e.name)).toEqual(['shop'])
  })

  it('formats held pins with the reason and the fix', () => {
    const text = formatHeldPins([{ name: 'shop-variations', wanted: 'v0.1.94', kept: 'v0.1.95' }])
    expect(text).toContain('shop-variations: kept v0.1.95, ignored request to pin v0.1.94')
    expect(text).toContain('Update the module')
  })
})
