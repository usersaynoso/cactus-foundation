import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { activeKey, isEncryptionKeyUsable as ringUsable, isWellFormedKey, readingKeys, rawCurrentEnvKey } from './keyring'

// AES-256-GCM secrets at rest. Which key encrypts and which keys are tried on the
// way back out is the keyring's business (lib/crypto/keyring.ts): one active key
// for writing, every key the site has ever had for reading.

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16

function toKey(hex: string): Buffer {
  if (!isWellFormedKey(hex)) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)')
  }
  return Buffer.from(hex, 'hex')
}

function getKey(): string {
  const hex = activeKey()
  if (!hex) {
    // Tell "not set" from "set but mangled" - the second is a paste gone wrong.
    if (rawCurrentEnvKey()) throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)')
    throw new Error(
      'ENCRYPTION_KEY is not set. Generate one with: openssl rand -hex 32'
    )
  }
  return hex
}

/** Encrypt under one named key. The rotation only - everything else uses encryptSecret. */
export function encryptWithKey(plaintext: string, keyHex: string): string {
  const key = toKey(keyHex)
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`
}

/** Decrypt under one named key; throws if it is not that key's. */
export function decryptWithKey(encrypted: string, keyHex: string): string {
  const key = toKey(keyHex)
  const parts = encrypted.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted secret format')
  }
  const [ivHex, authTagHex, ciphertextHex] = parts as [string, string, string]
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const ciphertext = Buffer.from(ciphertextHex, 'hex')
  if (iv.length !== IV_BYTES || authTag.length !== TAG_BYTES) {
    throw new Error('Invalid encrypted secret: bad iv or authTag length')
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

/** Decrypt under one named key, or null. */
export function tryDecryptWithKey(encrypted: string | null | undefined, keyHex: string): string | null {
  if (!encrypted) return null
  try {
    return decryptWithKey(encrypted, keyHex)
  } catch {
    return null
  }
}

// Returns "iv_hex:authTag_hex:ciphertext_hex", under the active key.
export function encryptSecret(plaintext: string): string {
  return encryptWithKey(plaintext, getKey())
}

// Accepts "iv_hex:authTag_hex:ciphertext_hex" written under any key in the ring.
// Throws the active key's error when none of them can read it.
export function decryptSecret(encrypted: string): string {
  const active = getKey()
  try {
    return decryptWithKey(encrypted, active)
  } catch (err) {
    for (const key of readingKeys()) {
      if (key === active) continue
      const plain = tryDecryptWithKey(encrypted, key)
      if (plain !== null) return plain
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// Reading secrets that may not belong to this install
// ---------------------------------------------------------------------------
//
// ENCRYPTION_KEY is minted per install (setup writes a fresh random one), but a
// database backup is portable - so a restored site routinely holds ciphertext
// that was written under a DIFFERENT key. GCM detects that and `decryptSecret`
// throws OpenSSL's famously unhelpful "Unsupported state or unable to
// authenticate data", which used to travel all the way to the owner's screen.
//
// Anything reading a stored secret it did not necessarily write should use
// `tryDecryptSecret` and treat null as "this install cannot read that", not as
// an error worth showing anyone.

/** True if the site has a well-formed key to encrypt and decrypt with. */
export function isEncryptionKeyUsable(): boolean {
  return ringUsable()
}

/**
 * True if `value` has the shape `encryptSecret` produces. Says nothing about
 * whether THIS install can decrypt it - only that it is one of ours to try.
 */
export function looksLikeEncryptedSecret(value: string): boolean {
  return new RegExp(`^[0-9a-f]{${IV_BYTES * 2}}:[0-9a-f]{${TAG_BYTES * 2}}:[0-9a-f]*$`, 'i').test(value)
}

/** Decrypt, or null if this install's key cannot read it (or there is no key). */
export function tryDecryptSecret(encrypted: string | null | undefined): string | null {
  if (!encrypted) return null
  try {
    return decryptSecret(encrypted)
  } catch {
    return null
  }
}
