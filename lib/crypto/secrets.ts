import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex) {
    throw new Error(
      'ENCRYPTION_KEY is not set. Generate one with: openssl rand -hex 32'
    )
  }
  if (hex.length !== 64 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)')
  }
  return Buffer.from(hex, 'hex')
}

// Returns "iv_hex:authTag_hex:ciphertext_hex"
export function encryptSecret(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`
}

// Accepts "iv_hex:authTag_hex:ciphertext_hex"
export function decryptSecret(encrypted: string): string {
  const key = getKey()
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
