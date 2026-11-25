import { createHmac, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import { getSessionSecret } from '@/lib/config/env'
import { getSessionFromCookie } from '@/lib/auth/session'

// The setup-bootstrap cookie.
//
// While the first-run wizard is open there is no session, so the routes that enrol
// the first passkey / authenticator app used to trust a userId in the request body.
// Anyone who knew (or learned) the admin's email and username could therefore enrol
// their own authenticator on that account before setup finished.
//
// /api/setup/create-admin now hands the browser that created the admin a signed,
// httpOnly, SameSite=Strict cookie naming that user. Every setup-window identity
// claim must match it. The cookie is an HMAC over "userId.expiry" keyed with
// SESSION_SECRET, so nothing is stored server-side and no schema change is needed.

export const SETUP_BOOTSTRAP_COOKIE = 'cactus_setup_bootstrap'

const TTL_SECONDS = 7 * 24 * 60 * 60

function sign(payload: string): string {
  return createHmac('sha256', getSessionSecret()).update(`setup-bootstrap:${payload}`).digest('hex')
}

function mintValue(userId: string, nowMs: number): string {
  const payload = `${userId}.${nowMs + TTL_SECONDS * 1000}`
  return `${payload}.${sign(payload)}`
}

/** Returns the userId the cookie value vouches for, or null if it is forged or expired. */
export function parseBootstrapValue(value: string | undefined, nowMs: number = Date.now()): string | null {
  if (!value) return null
  const sigAt = value.lastIndexOf('.')
  if (sigAt < 1) return null
  const payload = value.slice(0, sigAt)
  const givenSig = value.slice(sigAt + 1)
  const expAt = payload.lastIndexOf('.')
  if (expAt < 1) return null
  const userId = payload.slice(0, expAt)
  const expires = Number(payload.slice(expAt + 1))
  if (!Number.isFinite(expires) || expires < nowMs) return null

  let expected: string
  try {
    expected = sign(payload)
  } catch {
    // No usable SESSION_SECRET: nothing can be vouched for.
    return null
  }
  const a = Buffer.from(givenSig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return userId
}

/** Sets the cookie on the current response. Call only after creating or re-issuing the admin. */
export async function setBootstrapCookie(userId: string): Promise<void> {
  const store = await cookies()
  store.set(SETUP_BOOTSTRAP_COOKIE, mintValue(userId, Date.now()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: TTL_SECONDS,
  })
}

export async function clearBootstrapCookie(): Promise<void> {
  const store = await cookies()
  store.set(SETUP_BOOTSTRAP_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  })
}

/** The user the request's setup-bootstrap cookie vouches for, if any. */
export async function readBootstrapUserId(): Promise<string | null> {
  const store = await cookies()
  return parseBootstrapValue(store.get(SETUP_BOOTSTRAP_COOKIE)?.value)
}

/** True when the cookie vouches for exactly this user. */
export async function bootstrapCookieMatches(userId: string): Promise<boolean> {
  return (await readBootstrapUserId()) === userId
}

/**
 * May this request act on `userId` during the setup window? Yes if it holds the
 * bootstrap cookie for that user, or is already signed in as them.
 */
export async function mayActOnSetupUser(userId: string): Promise<boolean> {
  if (await bootstrapCookieMatches(userId)) return true
  const sessionUser = await getSessionFromCookie()
  return sessionUser?.id === userId
}

export const SETUP_LOCKED_OUT_MESSAGE =
  'This site is part-way through setup and this browser did not start it. If that was you, ' +
  'the half-finished admin account has to be deleted from the database by whoever manages it, ' +
  'and then you can set up again. If it was not you, leave it alone.'
