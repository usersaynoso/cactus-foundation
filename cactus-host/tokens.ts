// Per-site API tokens. The token is handed to the site once, in its env file; what
// cactus-host keeps is only its sha256, so a copy of the state directory is not a
// copy of every site's keys.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export function newToken(): string {
  return `chs_${randomBytes(32).toString('base64url')}`
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** Constant-time comparison of a presented token against a stored hash. */
export function tokenMatches(token: string, storedHash: string): boolean {
  const presented = Buffer.from(hashToken(token), 'hex')
  const stored = Buffer.from(storedHash, 'hex')
  return presented.length === stored.length && timingSafeEqual(presented, stored)
}

/** The token from an `Authorization: Bearer ...` header, or null. */
export function bearerToken(header: string | undefined): string | null {
  if (!header) return null
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header)
  return match?.[1] ?? null
}
