import { NextRequest, NextResponse } from 'next/server'
import { verifyMemberAuthentication } from '@/lib/members/passkey'
import { createMemberSession, setMemberSessionCookie } from '@/lib/members/session'
import { loginRejectionForStatus } from '@/lib/members/registration'
import { checkAndRecord, getClientIp } from '@/lib/auth/rate-limit'
import { recordMemberActivity } from '@/lib/members/activity'

export async function POST(request: NextRequest) {
  const ip = await getClientIp(request)
  const rl = await checkAndRecord('passkey_authenticate', [`ip:${ip}`])
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  try {
    const body = await request.json()

    const clientData = JSON.parse(
      Buffer.from(
        (body as { response?: { clientDataJSON?: string } })?.response?.clientDataJSON ?? '',
        'base64'
      ).toString('utf8')
    ) as { challenge?: string }
    const challenge = clientData.challenge ?? ''

    const { member } = await verifyMemberAuthentication(challenge, body)

    const rejection = loginRejectionForStatus(member.status)
    if (rejection) {
      return NextResponse.json(
        { error: rejection.error, redirectToVerify: rejection.redirectToVerify },
        { status: 403 }
      )
    }

    const token = await createMemberSession(member.id, {
      ipAddress: ip,
      userAgent: request.headers.get('user-agent') ?? undefined,
    })
    await setMemberSessionCookie(token)
    await recordMemberActivity(member.id, 'login', { metadata: { method: 'PASSKEY' } })

    return NextResponse.json({ verified: true, memberId: member.id })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Authentication failed' }, { status: 400 })
  }
}
