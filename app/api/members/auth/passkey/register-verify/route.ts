import { NextRequest, NextResponse } from 'next/server'
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server'
import { verifyMemberRegistration, saveMemberPasskey } from '@/lib/members/passkey'
import { getMemberFromCookie, isCurrentMemberSessionFresh } from '@/lib/members/session'
import { labelFromUserAgent } from '@/lib/auth/passkey'
import { notifyMemberSecurityAlert } from '@/lib/members/security-alerts'
import { getMembersConfig } from '@/lib/members/config'
import { consumeAdminStepUpGrant, findLinkedAdminForMember, saveAdminCopyOfPasskey } from '@/lib/members/admin-passkey-manage'

export async function POST(request: NextRequest) {
  const member = await getMemberFromCookie()
  if (!member) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Step-up: adding a new sign-in method is durable persistence, so it can't
  // ride a stale session. Require a recent authentication.
  if (!(await isCurrentMemberSessionFresh())) {
    return NextResponse.json(
      { error: 'For your security, please sign in again before adding a new passkey.', reauthRequired: true },
      { status: 403 }
    )
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
    const transports = ((attestation as { response?: { transports?: string[] } })?.response?.transports ?? []) as AuthenticatorTransportFuture[]
    await saveMemberPasskey(member.id, verification.registrationInfo, transports, label)

    // The admin behind this member account, having just confirmed with one of
    // their admin passkeys (lib/members/admin-passkey-manage.ts), gets the new
    // passkey on their admin account too. Without that confirmation it stays a
    // member passkey, as it always has.
    let addedToAdmin = false
    const admin = await findLinkedAdminForMember(member, await getMembersConfig())
    if (admin && (await consumeAdminStepUpGrant(member.id, admin.id))) {
      await saveAdminCopyOfPasskey(admin.id, verification.registrationInfo, transports, label)
      addedToAdmin = true
    }

    await notifyMemberSecurityAlert(
      member,
      addedToAdmin
        ? 'A new passkey was added to your account and to your admin account.'
        : 'A new passkey was added to your account.'
    )

    return NextResponse.json({ verified: true, addedToAdmin })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Verification failed' }, { status: 400 })
  }
}
