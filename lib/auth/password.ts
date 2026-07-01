import { createHash } from 'crypto'
import bcrypt from 'bcryptjs'

const BCRYPT_ROUNDS = 12
const MIN_PASSWORD_LENGTH = 8

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function validatePasswordStrength(password: string): {
  valid: boolean
  reason?: string
} {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      reason: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    }
  }
  return { valid: true }
}

// Checks the Pwned Passwords API using k-anonymity — the full password is
// never sent; only the first 5 hex characters of its SHA-1 hash.
// Returns how many times the password appears in known breaches (0 = clean).
export async function checkPwnedPassword(password: string): Promise<number> {
  const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase()
  const prefix = sha1.slice(0, 5)
  const suffix = sha1.slice(5)

  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      // 5-second timeout
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return 0 // fail open: don't block on API errors

    const body = await res.text()
    for (const line of body.split('\n')) {
      const [hashSuffix, count] = line.split(':')
      if (hashSuffix?.trim().toUpperCase() === suffix) {
        return parseInt(count?.trim() ?? '0', 10)
      }
    }
    return 0
  } catch {
    // Fail open: network issues or timeout shouldn't block registration
    return 0
  }
}

export async function validateNewPassword(password: string): Promise<{
  valid: boolean
  reason?: string
}> {
  const strength = validatePasswordStrength(password)
  if (!strength.valid) return strength

  const pwnedCount = await checkPwnedPassword(password)
  if (pwnedCount > 0) {
    return {
      valid: false,
      reason: `This password has appeared in ${pwnedCount.toLocaleString()} known data breaches. Please choose a different password.`,
    }
  }

  return { valid: true }
}
