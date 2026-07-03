import { NextRequest, NextResponse } from 'next/server'
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server'
import { verifyMemberRegistration, saveMemberPasskey } from '@/lib/members/passkey'
import { getMemberFromCookie } from '@/lib/members/session'
import { labelFromUserAgent } from '@/lib/auth/passkey'
import { notifyMemberSecurityAlert } from '@/lib/members/security-alerts'

export async function POST(request: NextRequest) {
  const member = await getMemberFromCookie()
  if (!member) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const attestation = await request.json()
    const clientData = JSON.parse(
      Buffer.from(
        (attestation as { response?: { clientDataJSON?: string } })?.response?.clientDataJSON ?? '',
        'base64'
      ).toString('utf8')
    ) as { challenge?: string }
    const challenge = clientData.challenge ?? ''

    const { verification, memberId: challengeMemberId } = await verifyMemberRegistration(challenge, attestation)

    // The challenge was minted for this exact signed-in member (register-options
    // stamps memberId from the session) - refuse if it somehow doesn't match.
    if (challengeMemberId !== member.id) {
      return NextResponse.json({ error: 'Challenge does not belong to this account' }, { status: 403 })
    }
    if (!verification.registrationInfo) {
      throw new Error('No registration info')
    }

    const label = labelFromUserAgent(request.headers.get('user-agent') ?? '')
    await saveMemberPasskey(
      member.id,
      verification.registrationInfo,
      ((attestation as { response?: { transports?: string[] } })?.response?.transports ?? []) as AuthenticatorTransportFuture[],
      label
    )
    await notifyMemberSecurityAlert(member, 'A new passkey was added to your account.')

    return NextResponse.json({ verified: true })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Verification failed' }, { status: 400 })
  }
}
