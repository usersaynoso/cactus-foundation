import { createHmac, timingSafeEqual } from 'crypto'
import { cookies, headers } from 'next/headers'
import { prisma } from '@/lib/db/prisma'
import { getSessionSecret, isEmailConfigured } from '@/lib/config/env'
import { getClientIp, countAttempt, rateLimitConfig } from '@/lib/auth/rate-limit'
import { labelFromUserAgent } from '@/lib/auth/passkey'
import { sendNewSignInNotice, sendFailedSignInsNotice } from '@/lib/email/index'

// Telling an admin when something happens to their account that they did not
// do: a sign-in from a browser that has never signed in to it before, and a pile
// of wrong passwords. Neither stops anything - the rate limits and the second
// factor do that - but without them nobody finds out until the damage is done.
//
// "A browser it has not seen before" is a long-lived, httpOnly cookie holding an
// HMAC of the user id under SESSION_SECRET. No table: a browser that has signed
// in as this user carries it, anything else does not. It is not a credential and
// grants nothing - forging one only suppresses an email to an account you have
// already signed in to. Clearing cookies costs one extra "was this you?" email.

const KNOWN_BROWSER_COOKIE = 'cactus_known_browser'
const KNOWN_BROWSER_MAX_AGE_S = 400 * 24 * 60 * 60 // browsers cap cookie life at 400 days

function knownBrowserValue(userId: string): string {
  return createHmac('sha256', getSessionSecret()).update(`known-browser:${userId}`).digest('hex')
}

function matches(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

async function requestDescription(): Promise<{ ipAddress: string; device: string }> {
  const ipAddress = await getClientIp()
  const ua = (await headers()).get('user-agent') ?? ''
  return { ipAddress: ipAddress === 'unknown' ? 'an unknown address' : ipAddress, device: ua ? labelFromUserAgent(ua) : 'an unknown device' }
}

async function siteName(): Promise<string> {
  const config = await prisma.siteConfig.findUnique({ where: { id: 'singleton' }, select: { siteName: true } })
  return config?.siteName ?? 'Cactus'
}

/**
 * Call straight after a successful admin sign-in has set its session cookie.
 * Marks this browser as known for the user, and emails them if it was not.
 * Never throws: a mail outage must not turn a good sign-in into an error.
 */
export async function noteSuccessfulSignIn(user: { id: string; email: string }): Promise<void> {
  try {
    const cookieStore = await cookies()
    const expected = knownBrowserValue(user.id)
    // One cookie per browser, so it holds whichever account signed in last. Two
    // admins sharing a browser each get an alert when they take turns - a fair
    // price for not needing a table.
    const seen = cookieStore.get(KNOWN_BROWSER_COOKIE)?.value
    cookieStore.set(KNOWN_BROWSER_COOKIE, expected, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: KNOWN_BROWSER_MAX_AGE_S,
      path: '/',
    })
    if (seen && matches(seen, expected)) return
    if (!isEmailConfigured()) return

    const { ipAddress, device } = await requestDescription()
    const when = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'full', timeStyle: 'short' })
    await sendNewSignInNotice(user.email, { siteName: await siteName(), when, device, ipAddress })
  } catch (err) {
    console.error('[sign-in-alerts] new sign-in notice failed:', err)
  }
}

/**
 * Call when a password was wrong for an account that exists. Counts it, and on
 * the attempt that lands exactly on the threshold emails the owner - so one
 * email per window, however long the guessing goes on. Never throws.
 */
export async function noteFailedPassword(user: { id: string; email: string }): Promise<void> {
  try {
    const attempts = await countAttempt('login_failure', `account:${user.id}`)
    const { maxAttempts, windowMs } = rateLimitConfig('login_failure')
    if (attempts !== maxAttempts) return
    if (!isEmailConfigured()) return

    const { ipAddress, device } = await requestDescription()
    await sendFailedSignInsNotice(user.email, {
      siteName: await siteName(),
      attempts: String(attempts),
      windowMinutes: String(Math.round(windowMs / 60_000)),
      ipAddress,
      device,
    })
  } catch (err) {
    console.error('[sign-in-alerts] failed sign-in notice failed:', err)
  }
}
