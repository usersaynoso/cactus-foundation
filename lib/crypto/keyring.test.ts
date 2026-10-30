import { createHmac } from 'crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  activeKey,
  derivationSalt,
  hmacSign,
  hmacVerify,
  isWellFormedKey,
  keyFingerprint,
  readingKeys,
  resetKeyringState,
  ringFingerprints,
  setKeyringState,
  verifyWithAnyKey,
} from './keyring'
import { decryptSecret, encryptSecret, encryptWithKey, tryDecryptSecret } from './secrets'

// The four states a rotation passes through (lib/crypto/rotation.ts). Each must
// read everything every earlier state wrote, or the running site loses a secret
// or a customer's link on the way.

const OLD = 'a'.repeat(64)
const NEW = 'b'.repeat(64)
const ANCIENT = 'c'.repeat(64)
const STRANGER = 'd'.repeat(64)

const saved = { key: process.env.ENCRYPTION_KEY, next: process.env.ENCRYPTION_KEY_NEXT }

function env(current: string | undefined, next?: string) {
  if (current === undefined) delete process.env.ENCRYPTION_KEY
  else process.env.ENCRYPTION_KEY = current
  if (next === undefined) delete process.env.ENCRYPTION_KEY_NEXT
  else process.env.ENCRYPTION_KEY_NEXT = next
}

beforeEach(() => {
  resetKeyringState()
  env(OLD)
})

afterEach(() => {
  resetKeyringState()
  env(saved.key, saved.next)
})

describe('key shape and fingerprint', () => {
  it('accepts only 64 hex characters', () => {
    expect(isWellFormedKey(OLD)).toBe(true)
    expect(isWellFormedKey(OLD.toUpperCase())).toBe(true)
    expect(isWellFormedKey('a'.repeat(63))).toBe(false)
    expect(isWellFormedKey('z'.repeat(64))).toBe(false)
    expect(isWellFormedKey(` ${'a'.repeat(63)}`)).toBe(false)
    expect(isWellFormedKey(null)).toBe(false)
  })

  it('fingerprints case-insensitively and never contains the key', () => {
    expect(keyFingerprint(OLD)).toBe(keyFingerprint(OLD.toUpperCase()))
    expect(keyFingerprint(OLD)).not.toBe(keyFingerprint(NEW))
    expect(keyFingerprint(OLD)).toHaveLength(16)
    expect(OLD).not.toContain(keyFingerprint(OLD))
  })
})

describe('active key through a rotation', () => {
  it('S0: the current key', () => {
    expect(activeKey()).toBe(OLD)
  })

  it('S1: still the current key while NEXT is only staged', () => {
    env(OLD, NEW)
    setKeyringState({ activeFingerprint: null })
    expect(activeKey()).toBe(OLD)
    // ...but NEXT is already readable, so a value it wrote is never stranded.
    expect(readingKeys()).toEqual([OLD, NEW])
  })

  it('S2: NEXT once the database says the rotation committed', () => {
    env(OLD, NEW)
    setKeyringState({ activeFingerprint: keyFingerprint(NEW) })
    expect(activeKey()).toBe(NEW)
    expect(readingKeys()).toEqual([NEW, OLD])
  })

  it('S3: the swapped-in key, with the old one from history', () => {
    env(NEW)
    setKeyringState({ activeFingerprint: keyFingerprint(NEW), previous: [OLD] })
    expect(activeKey()).toBe(NEW)
    expect(readingKeys()).toEqual([NEW, OLD])
  })

  it('a database fingerprint for a key the host does not hold changes nothing', () => {
    setKeyringState({ activeFingerprint: keyFingerprint(STRANGER) })
    expect(activeKey()).toBe(OLD)
  })

  it('ignores a malformed key on the host', () => {
    env('not-a-key', NEW)
    expect(activeKey()).toBe(NEW)
    env('not-a-key')
    expect(activeKey()).toBeNull()
    expect(readingKeys()).toEqual([])
  })

  it('lists every key once, whatever the case', () => {
    env(OLD, NEW)
    setKeyringState({ previous: [OLD.toUpperCase(), ANCIENT] })
    expect(readingKeys()).toEqual([OLD, NEW, ANCIENT])
    expect(ringFingerprints()).toEqual(new Set([OLD, NEW, ANCIENT].map(keyFingerprint)))
  })
})

describe('decrypting with current, next and previous keys', () => {
  it('reads a secret written under NEXT before the rotation made it active', () => {
    const underNew = encryptWithKey('vapid', NEW)
    env(OLD, NEW)
    expect(decryptSecret(underNew)).toBe('vapid')
  })

  it('reads a secret written under a previous key', () => {
    const underAncient = encryptWithKey('totp', ANCIENT)
    expect(tryDecryptSecret(underAncient)).toBeNull()
    setKeyringState({ previous: [ANCIENT] })
    expect(decryptSecret(underAncient)).toBe('totp')
  })

  it('writes under the active key only', () => {
    env(OLD, NEW)
    setKeyringState({ activeFingerprint: keyFingerprint(NEW) })
    const written = encryptSecret('github')
    env(NEW)
    resetKeyringState()
    expect(decryptSecret(written)).toBe('github')
  })

  it('still refuses a stranger key, with the usual error', () => {
    setKeyringState({ previous: [ANCIENT] })
    expect(() => decryptSecret(encryptWithKey('x', STRANGER))).toThrow()
    expect(tryDecryptSecret(encryptWithKey('x', STRANGER))).toBeNull()
  })
})

describe('signatures', () => {
  it('signs with the active key, keyed on the hex string', () => {
    expect(hmacSign('invoice:1')).toBe(createHmac('sha256', OLD).update('invoice:1').digest('base64url'))
    expect(hmacSign('invoice:1', 'hex')).toBe(createHmac('sha256', OLD).update('invoice:1').digest('hex'))
  })

  it('verifies a link signed with the current, next or a previous key', () => {
    const signed = (key: string) => createHmac('sha256', key).update('receipt:42').digest('base64url')
    env(NEW, undefined)
    setKeyringState({ previous: [OLD] })
    expect(hmacVerify('receipt:42', signed(NEW))).toBe(true)
    expect(hmacVerify('receipt:42', signed(OLD))).toBe(true)
    expect(hmacVerify('receipt:42', signed(STRANGER))).toBe(false)
    env(NEW, ANCIENT)
    expect(hmacVerify('receipt:42', signed(ANCIENT))).toBe(true)
  })

  it('a signature for one payload never verifies another', () => {
    expect(hmacVerify('receipt:43', hmacSign('receipt:42'))).toBe(false)
  })

  it('is false, not a throw, for malformed or missing tokens', () => {
    expect(hmacVerify('x', null)).toBe(false)
    expect(hmacVerify('x', '')).toBe(false)
    expect(hmacVerify('x', 'short')).toBe(false)
    expect(verifyWithAnyKey('abc', () => { throw new Error('bad recipe') })).toBe(false)
  })

  it('verifyWithAnyKey runs a module recipe against every key', () => {
    const recipe = (key: string) => createHmac('sha256', key).update('chat-attachment:1').digest('base64url').slice(0, 32)
    setKeyringState({ previous: [ANCIENT] })
    expect(verifyWithAnyKey(recipe(ANCIENT), recipe)).toBe(true)
    expect(verifyWithAnyKey(recipe(STRANGER), recipe)).toBe(false)
  })

  it('keeps signing with an oddly shaped key, as the modules always did', () => {
    env('a-test-key-that-is-at-least-32-characters-long')
    const token = hmacSign('receipt:1')
    expect(token).toBe(createHmac('sha256', 'a-test-key-that-is-at-least-32-characters-long').update('receipt:1').digest('base64url'))
    expect(hmacVerify('receipt:1', token)).toBe(true)
  })

  it('throws a purposeful error when there is no key to sign with', () => {
    env(undefined)
    expect(() => hmacSign('x')).toThrow(/ENCRYPTION_KEY is not set/)
  })
})

describe('derivation salt', () => {
  it('falls back to the current key, which is what ids were always made from', () => {
    expect(derivationSalt()).toBe(OLD)
  })

  it('stays put once stored, whatever the key becomes', () => {
    setKeyringState({ derivationSalt: OLD })
    env(NEW)
    expect(derivationSalt()).toBe(OLD)
  })

  it('is null on a site with no key and no salt', () => {
    env(undefined)
    expect(derivationSalt()).toBeNull()
  })
})
