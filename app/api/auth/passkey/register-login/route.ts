import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server'
import { verifyRegistration, savePasskey } from '@/lib/auth/passkey'
import { createSession, setSessionCookie } from '@/lib/auth/session'
import { prisma } from '@/lib/db/prisma'

const Body = z.object({
  userId: z.string(),
  attestation: z.unknown(),
})

// Registers a new passkey and immediately creates an authenticated session.
// Only reachable when the server has already confirmed the account has zero
// passkeys — the WebAuthn attestation itself (signed by the user's hardware)
// is the authentication factor that authorises the session creation.
export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const { userId, attestation } = parsed.data

  // Confirm the user still has no passkeys at the time of registration
  // (guards against a race where another passkey was added between the
  // authenticate-options check and this call).
  const count = await prisma.passkey.count({ where: { userId } })
  if (count > 0) {
    return NextResponse.json({ error: 'Account already has a passkey — use normal sign-in' }, { status: 409 })
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, suspendedAt: true } })
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }
  if (user.suspendedAt) {
    return NextResponse.json({ error: 'Account suspended' }, { status: 403 })
  }

  try {
    const att = attestation as Parameters<typeof verifyRegistration>[1]
    const clientData = JSON.parse(
      Buffer.from(
        (att as { response?: { clientDataJSON?: string } })?.response?.clientDataJSON ?? '',
        'base64'
      ).toString('utf8')
    ) as { challenge?: string }
    const challenge = clientData.challenge ?? ''

    const { verification } = await verifyRegistration(challenge, att)

    if (!verification.registrationInfo) {
      throw new Error('No registration info')
    }

    await savePasskey(
      userId,
      verification.registrationInfo,
      ((att as { response?: { transports?: string[] } })?.response?.transports ?? []) as AuthenticatorTransportFuture[]
    )

    const token = await createSession(userId)
    await setSessionCookie(token)

    return NextResponse.json({ verified: true })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Registration failed' }, { status: 400 })
  }
}
