import { NextRequest, NextResponse } from 'next/server'
import { verifyAuthentication } from '@/lib/auth/passkey'
import { createSession, setSessionCookie } from '@/lib/auth/session'
import { checkAndRecord, getClientIp } from '@/lib/auth/rate-limit'

export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  const rl = await checkAndRecord('passkey_authenticate', [`ip:${ip}`])
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  try {
    const body = await request.json()

    // Extract challenge from clientDataJSON — use the full assertion body, same
    // pattern as register-verify (attestation.response.clientDataJSON).
    const clientData = JSON.parse(
      Buffer.from(
        (body as { response?: { clientDataJSON?: string } })?.response?.clientDataJSON ?? '',
        'base64'
      ).toString('utf8')
    ) as { challenge?: string }
    const challenge = clientData.challenge ?? ''

    const { user } = await verifyAuthentication(challenge, body)

    if (user.suspendedAt) {
      return NextResponse.json({ error: 'Account suspended' }, { status: 403 })
    }

    const token = await createSession(user.id)
    await setSessionCookie(token)

    return NextResponse.json({ verified: true, userId: user.id })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Authentication failed' }, { status: 400 })
  }
}
