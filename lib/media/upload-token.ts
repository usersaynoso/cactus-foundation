import { createHmac, timingSafeEqual } from 'node:crypto'
import { getSessionSecret } from '@/lib/config/env'

// Signed short-lived tokens that authorise a single direct-to-Worker upload.
//
// The client never receives storage credentials: it gets a token bound to one
// exact object key, PUTs the bytes to the Worker, and the Worker verifies the
// token with the same signing key before writing to storage. Only holders of
// `media.upload` are ever handed a token (the issuing route checks the
// permission), so an attacker without one cannot forge a valid signature.
//
// The signing key is derived from SESSION_SECRET rather than being a new env
// var, so operators have nothing extra to configure. The derived value - not
// SESSION_SECRET itself - is what gets pushed to the Worker as
// UPLOAD_SIGNING_SECRET at deploy time, so the session secret never leaves the
// app.

const DERIVATION_LABEL = 'cactus-media-upload-v1'

// Default token lifetime. Long enough to upload a large file over a slow line,
// short enough that a leaked token is stale quickly.
export const UPLOAD_TOKEN_TTL_MS = 15 * 60 * 1000

// The value shared with the Worker (env UPLOAD_SIGNING_SECRET). Deterministic
// from SESSION_SECRET so the app can both sign tokens and provision the Worker
// without storing anything.
export function deriveUploadSigningKey(): string {
  return createHmac('sha256', getSessionSecret()).update(DERIVATION_LABEL).digest('hex')
}

function sign(key: string, message: string): string {
  return createHmac('sha256', key).update(message).digest('base64url')
}

// Token binds the object key and an expiry epoch (ms). Format: `<exp>.<sig>`.
// The Worker knows the key from the request path and rebuilds the same message.
export function signUploadToken(objectKey: string, ttlMs: number = UPLOAD_TOKEN_TTL_MS, now = Date.now()): { token: string; exp: number } {
  const exp = now + ttlMs
  const sig = sign(deriveUploadSigningKey(), `${objectKey}\n${exp}`)
  return { token: `${exp}.${sig}`, exp }
}

// Server-side counterpart used only in tests / defence in depth; the Worker does
// the real verification at write time.
export function verifyUploadToken(objectKey: string, token: string, now = Date.now()): boolean {
  const dot = token.indexOf('.')
  if (dot === -1) return false
  const exp = Number(token.slice(0, dot))
  const sig = token.slice(dot + 1)
  if (!Number.isFinite(exp) || exp < now) return false
  const expected = sign(deriveUploadSigningKey(), `${objectKey}\n${exp}`)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
