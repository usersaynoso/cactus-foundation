import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { createRegistrationChallenge } from '@/lib/auth/passkey'
import { getSessionFromCookie } from '@/lib/auth/session'
import { isSetupBootstrapOpen } from '@/lib/auth/setup-window'
import { getWebAuthnOrigin } from '@/lib/config/env'

const Body = z.object({
  // Only honoured during the first-run setup wizard, where no session exists yet.
  // After setup the target account always comes from the session cookie - a body
  // userId is ignored, never trusted. See lib/auth/setup-window.ts.
  userId: z.string().optional(),
})

export async function POST(request: NextRequest) {
  // Guard: the request Origin must match SITE_URL. A mismatch means the user is
  // accessing setup from a per-deployment Vercel URL (cactus-xyz.vercel.app) while
  // SITE_URL points to the stable alias. WebAuthn rpId is derived from SITE_URL, so
  // the browser would reject the credentials with a cryptic Safari TypeError.
  try {
    const requestOrigin = request.headers.get('origin')
    const expectedOrigin = getWebAuthnOrigin()
    if (requestOrigin && requestOrigin !== expectedOrigin) {
      return NextResponse.json(
        { error: `Passkey registration must be done from ${expectedOrigin} — please visit ${expectedOrigin}/setup` },
        { status: 400 }
      )
    }
  } catch {
    // getWebAuthnOrigin() throws if SITE_URL is not set (e.g. during initial env setup).
    // Allow the request through; the downstream createRegistrationChallenge call will
    // handle the missing env var gracefully.
  }

  // The account page adds a passkey with no request body at all.
  const parsed = Body.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  // Resolve WHO this challenge is for. A body userId is only an identity claim
  // during first-run setup; at any other time the session cookie is the only
  // acceptable proof, so we derive the user from it and discard the body value.
  // Without this, an unauthenticated caller could name any account, enrol their
  // own authenticator against it and take it over.
  let userId: string
  if (await isSetupBootstrapOpen()) {
    const claimed = parsed.data.userId
    if (claimed) {
      userId = claimed
    } else {
      const user = await getSessionFromCookie()
      if (!user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
      }
      userId = user.id
    }
  } else {
    const user = await getSessionFromCookie()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    userId = user.id
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { passkeys: { select: { credentialId: true, transports: true } } },
  })
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  try {
    const opts = await createRegistrationChallenge(
      userId,
      user.email,
      user.username,
      user.passkeys
    )
    return NextResponse.json(opts)
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate registration options' },
      { status: 500 }
    )
  }
}
