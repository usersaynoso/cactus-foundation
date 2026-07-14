import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  encryptSecret,
  decryptSecret,
  tryDecryptSecret,
  looksLikeEncryptedSecret,
  isEncryptionKeyUsable,
} from './secrets'

// ENCRYPTION_KEY is minted per install, so any site restored from another site's
// backup holds ciphertext it cannot read. Everything that reads a stored secret
// depends on that being *detectable* rather than explosive: `decryptSecret` throws
// OpenSSL's "Unsupported state or unable to authenticate data", which used to reach
// the owner's screen on the update button. These are the primitives that stop it.

const KEY_A = 'a'.repeat(64)
const KEY_B = 'b'.repeat(64)

const original = process.env.ENCRYPTION_KEY

beforeEach(() => {
  process.env.ENCRYPTION_KEY = KEY_A
})

afterEach(() => {
  if (original === undefined) delete process.env.ENCRYPTION_KEY
  else process.env.ENCRYPTION_KEY = original
})

describe('encrypt / decrypt', () => {
  it('round-trips a secret under the same key', () => {
    const encrypted = encryptSecret('-----BEGIN RSA PRIVATE KEY-----')
    expect(decryptSecret(encrypted)).toBe('-----BEGIN RSA PRIVATE KEY-----')
  })

  it('gives a different ciphertext every time (fresh IV)', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'))
  })
})

describe('tryDecryptSecret', () => {
  it('returns null for a secret encrypted under another install key', () => {
    const fromOtherSite = encryptSecret('their github app private key')
    process.env.ENCRYPTION_KEY = KEY_B

    // The raw path is the one that used to reach the site owner.
    expect(() => decryptSecret(fromOtherSite)).toThrow()
    expect(tryDecryptSecret(fromOtherSite)).toBeNull()
  })

  it('returns null rather than throwing when there is no key at all', () => {
    const encrypted = encryptSecret('x')
    delete process.env.ENCRYPTION_KEY
    expect(tryDecryptSecret(encrypted)).toBeNull()
  })

  it('returns null for empty and malformed values', () => {
    expect(tryDecryptSecret(null)).toBeNull()
    expect(tryDecryptSecret('')).toBeNull()
    expect(tryDecryptSecret('not ciphertext at all')).toBeNull()
  })
})

describe('looksLikeEncryptedSecret', () => {
  it('recognises what encryptSecret produces', () => {
    const ours = encryptSecret('hello')
    expect(looksLikeEncryptedSecret(ours)).toBe(true)
    expect(looksLikeEncryptedSecret(encryptSecret(''))).toBe(true)

    // Still recognisably ours when this install cannot read it. That is the whole
    // point: a restore has to tell "ours, wrong key" from "not ours".
    process.env.ENCRYPTION_KEY = KEY_B
    expect(looksLikeEncryptedSecret(ours)).toBe(true)
    expect(tryDecryptSecret(ours)).toBeNull()
  })

  it('leaves anything that is not ours alone', () => {
    // A restore only clears values it can positively identify as this scheme's, so
    // a module storing something else in a column named *Encrypted keeps its data.
    expect(looksLikeEncryptedSecret('plain text')).toBe(false)
    expect(looksLikeEncryptedSecret('')).toBe(false)
    expect(looksLikeEncryptedSecret('deadbeef:cafe:1234')).toBe(false)
    expect(looksLikeEncryptedSecret('-----BEGIN RSA PRIVATE KEY-----')).toBe(false)
    // Right shape, wrong lengths.
    expect(looksLikeEncryptedSecret(`${'a'.repeat(20)}:${'b'.repeat(32)}:cc`)).toBe(false)
  })
})

describe('isEncryptionKeyUsable', () => {
  it('is true only for a 64-character hex key', () => {
    expect(isEncryptionKeyUsable()).toBe(true)
    process.env.ENCRYPTION_KEY = 'too-short'
    expect(isEncryptionKeyUsable()).toBe(false)
    process.env.ENCRYPTION_KEY = 'z'.repeat(64)
    expect(isEncryptionKeyUsable()).toBe(false)
    delete process.env.ENCRYPTION_KEY
    expect(isEncryptionKeyUsable()).toBe(false)
  })
})
