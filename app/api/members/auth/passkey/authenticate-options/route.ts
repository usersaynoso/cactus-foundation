import { NextRequest, NextResponse } from 'next/server'
import { createMemberAuthenticationChallenge } from '@/lib/members/passkey'
import { checkAndRecord, getClientIp } from '@/lib/auth/rate-limit'

// Always returns an unscoped challenge with an empty allowCredentials list (the
// discoverable-credential flow), so the response is byte-identical regardless
// of whether the email maps to an active member or that member has a passkey.
// Removes the account-enumeration signal the previous three-way response shape
// leaked. The authenticator finds the matching resident passkey itself.
export async function POST(request: NextRequest) {
  const ip = await getClientIp(request)
  const rl = await checkAndRecord('passkey_authenticate', [`ip:${ip}`])
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  try {
    const opts = await createMemberAuthenticationChallenge()
    return NextResponse.json(opts)
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to generate challenge' }, { status: 500 })
  }
}
