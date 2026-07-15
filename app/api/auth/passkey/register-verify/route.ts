import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server'
import { verifyRegistration, savePasskey, labelFromUserAgent } from '@/lib/auth/passkey'
import { getSessionFromCookie, isCurrentSessionFresh } from '@/lib/auth/session'
import { isSetupBootstrapOpen } from '@/lib/auth/setup-window'

const Body = z.object({
  // Only honoured during the first-run setup wizard (see lib/auth/setup-window.ts).
  // After setup the account comes from the session cookie.
  userId: z.string().optional(),
  attestation: z.unknown(),
  challenge: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const bootstrapOpen = await isSetupBootstrapOpen()
  const sessionUser = await getSessionFromCookie()

  // Outside the setup window a session is mandatory: this route writes a new
  // authenticator onto an account, so it must know the account is the caller's.
  if (!bootstrapOpen && !sessionUser) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Step-up: adding a new sign-in method is durable persistence, so it can't
  // ride a stale session. Require a recent authentication (the setup window is
  // its own gate and is exempt). A borrowed unlocked browser whose session is
  // older than the window is turned away until the real owner re-authenticates.
  if (!bootstrapOpen && !(await isCurrentSessionFresh())) {
    return NextResponse.json(
      { error: 'For your security, please sign in again before adding a new passkey.', reauthRequired: true },
      { status: 403 }
    )
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

    // The stored challenge carries the user it was issued for, so it can't be
    // swapped for another account via the request body. Outside setup, that user
    // must also be the signed-in one - a challenge minted for someone else is
    // refused outright rather than quietly retargeted (this mirrors the members
    // flow's challengeMemberId check).
    const targetUserId = challengeUserId ?? (bootstrapOpen ? parsed.data.userId ?? null : sessionUser?.id ?? null)
    if (!targetUserId) {
      throw new Error('Could not determine user for passkey registration')
    }
    if (!bootstrapOpen && targetUserId !== sessionUser?.id) {
      return NextResponse.json({ error: 'Challenge does not belong to the signed-in account' }, { status: 403 })
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
