import { prisma } from '@/lib/db/prisma'
import { headers } from 'next/headers'
import { randomUUID } from 'crypto'
import type { NextRequest } from 'next/server'

type RateLimitAction =
  | 'login'
  | 'register'
  | 'recovery_request'
  | 'email_code'
  | 'passkey_authenticate'
  | 'consent'
  | 'totp_verify'
  // Members system (see MEMBERS_SPEC.md)
  | 'member_register'
  | 'member_magic_link'
  | 'member_login'
  | 'member_2fa'
  | 'member_verify'
  | 'member_username'

type RateLimitConfig = {
  windowMs: number
  maxAttempts: number
}

const LIMITS: Record<RateLimitAction, RateLimitConfig> = {
  login: { windowMs: 15 * 60 * 1000, maxAttempts: 10 },
  register: { windowMs: 60 * 60 * 1000, maxAttempts: 5 },
  recovery_request: { windowMs: 60 * 60 * 1000, maxAttempts: 3 },
  email_code: { windowMs: 15 * 60 * 1000, maxAttempts: 5 },
  passkey_authenticate: { windowMs: 15 * 60 * 1000, maxAttempts: 20 },
  consent: { windowMs: 15 * 60 * 1000, maxAttempts: 30 },
  totp_verify: { windowMs: 15 * 60 * 1000, maxAttempts: 5 },
  member_register: { windowMs: 60 * 60 * 1000, maxAttempts: 5 },
  member_magic_link: { windowMs: 15 * 60 * 1000, maxAttempts: 5 },
  member_login: { windowMs: 15 * 60 * 1000, maxAttempts: 10 },
  member_2fa: { windowMs: 15 * 60 * 1000, maxAttempts: 5 },
  member_verify: { windowMs: 60 * 60 * 1000, maxAttempts: 10 },
  member_username: { windowMs: 60 * 60 * 1000, maxAttempts: 10 },
}

// Accepts an optional NextRequest for use in API route handlers.
// Without one, reads headers from the Next.js request context via next/headers.
export async function getClientIp(request?: NextRequest): Promise<string> {
  if (request) {
    return (
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown'
    )
  }
  const headersList = await headers()
  return (
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headersList.get('x-real-ip') ??
    'unknown'
  )
}

export async function checkRateLimit(
  action: RateLimitAction,
  identifiers: string[] // e.g. ['ip:1.2.3.4', 'account:userId']
): Promise<{ allowed: boolean; retryAfterMs?: number }> {
  const config = LIMITS[action]
  const windowStart = new Date(Date.now() - config.windowMs)

  for (const key of identifiers) {
    const record = await prisma.rateLimit.findUnique({
      where: { key_action: { key, action } },
    })

    if (record && record.windowStart > windowStart) {
      if (record.attempts >= config.maxAttempts) {
        const retryAfterMs =
          record.windowStart.getTime() + config.windowMs - Date.now()
        return { allowed: false, retryAfterMs }
      }
    }
  }

  return { allowed: true }
}

export async function recordAttempt(
  action: RateLimitAction,
  identifiers: string[]
): Promise<void> {
  const windowStart = new Date(Date.now() - LIMITS[action].windowMs)

  await Promise.all(
    identifiers.map(async (key) => {
      const existing = await prisma.rateLimit.findUnique({
        where: { key_action: { key, action } },
      })

      if (!existing || existing.windowStart <= windowStart) {
        // Start a fresh window
        await prisma.rateLimit.upsert({
          where: { key_action: { key, action } },
          create: { key, action, attempts: 1, windowStart: new Date() },
          update: { attempts: 1, windowStart: new Date() },
        })
      } else {
        await prisma.rateLimit.update({
          where: { key_action: { key, action } },
          data: { attempts: { increment: 1 } },
        })
      }
    })
  )
}

// Atomic check-and-increment: the INSERT ... ON CONFLICT clause takes a row
// lock on the (key, action) pair, so concurrent requests serialize on the
// update instead of all reading the pre-increment count (the TOCTOU window
// checkRateLimit + recordAttempt has when called separately).
export async function checkAndRecord(
  action: RateLimitAction,
  identifiers: string[]
): Promise<{ allowed: boolean; retryAfterMs?: number }> {
  const config = LIMITS[action]
  const windowStart = new Date(Date.now() - config.windowMs)

  let blocked: { retryAfterMs: number } | null = null

  for (const key of identifiers) {
    const rows = await prisma.$queryRaw<Array<{ attempts: number; windowStart: Date }>>`
      INSERT INTO "RateLimit" (id, key, action, attempts, "windowStart")
      VALUES (${randomUUID()}, ${key}, ${action}, 1, now())
      ON CONFLICT (key, action) DO UPDATE SET
        attempts = CASE
          WHEN "RateLimit"."windowStart" <= ${windowStart} THEN 1
          ELSE "RateLimit".attempts + 1
        END,
        "windowStart" = CASE
          WHEN "RateLimit"."windowStart" <= ${windowStart} THEN now()
          ELSE "RateLimit"."windowStart"
        END
      RETURNING attempts, "windowStart"
    `

    const record = rows[0]
    if (record && record.attempts > config.maxAttempts) {
      const retryAfterMs = record.windowStart.getTime() + config.windowMs - Date.now()
      blocked = { retryAfterMs }
    }
  }

  if (blocked) {
    return { allowed: false, retryAfterMs: blocked.retryAfterMs }
  }
  return { allowed: true }
}
