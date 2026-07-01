import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server'
import { verifyRegistration, savePasskey, labelFromUserAgent } from '@/lib/auth/passkey'
import { getSessionFromCookie } from '@/lib/auth/session'

const Body = z.object({
  userId: z.string().optional(),
  attestation: z.unknown(),
  challenge: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  let resolvedUserId = parsed.data.userId ?? null
  if (!resolvedUserId) {
    const user = await getSessionFromCookie()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    resolvedUserId = user.id
  }

  try {
    // The challenge is embedded in the attestation response
    const attestation = parsed.data.attestation as Parameters<typeof verifyRegistration>[1]
    const clientData = JSON.parse(
      Buffer.from(
        (attestation as { response?: { clientDataJSON?: string } })?.response?.clientDataJSON ?? '',
        'base64'
      ).toString('utf8')
    ) as { challenge?: string }
    const challenge = clientData.challenge ?? ''

    const { verification, userId: challengeUserId } = await verifyRegistration(challenge, attestation)

    if (!verification.registrationInfo) {
      throw new Error('No registration info')
    }

    // Use the userId from the stored challenge so it can't be spoofed via the request body.
    // Fall back to resolvedUserId only during setup when challenge.userId may be null.
    const targetUserId = challengeUserId ?? resolvedUserId
    if (!targetUserId) {
      throw new Error('Could not determine user for passkey registration')
    }

    const label = labelFromUserAgent(request.headers.get('user-agent') ?? '')
    await savePasskey(
      targetUserId,
      verification.registrationInfo,
      ((attestation as { response?: { transports?: string[] } })?.response?.transports ?? []) as AuthenticatorTransportFuture[],
      label
    )

    return NextResponse.json({ verified: true })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Verification failed' }, { status: 400 })
  }
}
