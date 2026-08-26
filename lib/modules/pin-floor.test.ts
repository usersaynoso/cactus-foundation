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

describe('applyPinFloor and a build that failed', () => {
  const sv = (version: string, lastFailedVersion?: string) => ({
    name: 'shop-variations',
    repoUrl: 'https://github.com/cactus-foundation-modules/shop-variations',
    version,
    ...(lastFailedVersion ? { lastFailedVersion } : {}),
  })

  // The wedge. modules.json is committed pinning the new tag BEFORE the build
  // runs, so a failed update leaves the repo on a version that cannot build while
  // the database rolls back to the one that could. Without the exception the floor
  // holds the broken pin, and every later deploy - core, another module, a
  // settings change - rebuilds it and fails identically. The site cannot deploy
  // anything at all until the module's author publishes a higher version.
  it('lowers past the exact version whose build failed', () => {
    const { entries, held } = applyPinFloor(
      [sv('v0.1.168', 'v0.1.169')],
      [{ name: 'shop-variations', version: 'v0.1.169' }]
    )

    expect(entries[0]?.version).toBe('v0.1.168')
    expect(held).toEqual([])
  })

  // The floor's original job, unchanged: a pin moved forward in git that the
  // database never heard about is drift, and drift is held.
  it('still holds a higher pin that is not the failed one', () => {
    const { entries, held } = applyPinFloor(
      [sv('v0.1.168', 'v0.1.169')],
      [{ name: 'shop-variations', version: 'v0.1.170' }]
    )

    expect(entries[0]?.version).toBe('v0.1.170')
    expect(held).toHaveLength(1)
  })

  it('holds when nothing has been recorded as failed', () => {
    const { entries, held } = applyPinFloor(
      [sv('v0.1.168')],
      [{ name: 'shop-variations', version: 'v0.1.169' }]
    )

    expect(entries[0]?.version).toBe('v0.1.169')
    expect(held).toHaveLength(1)
  })

  // The exception is per module, never a blanket licence to lower.
  it('does not let one module’s failure lower another’s pin', () => {
    const { entries, held } = applyPinFloor(
      [
        sv('v0.1.168', 'v0.1.169'),
        { name: 'shop', repoUrl: 'https://github.com/cactus-foundation-modules/shop', version: 'v0.1.335' },
      ],
      [
        { name: 'shop-variations', version: 'v0.1.169' },
        { name: 'shop', version: 'v0.1.336' },
      ]
    )

    expect(entries.find((e) => e.name === 'shop-variations')?.version).toBe('v0.1.168')
    expect(entries.find((e) => e.name === 'shop')?.version).toBe('v0.1.336')
    expect(held.map((h) => h.name)).toEqual(['shop'])
  })
})
