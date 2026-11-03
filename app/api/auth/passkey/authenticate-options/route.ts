import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticationChallenge } from '@/lib/auth/passkey'
import { checkAndRecord, getClientIp } from '@/lib/auth/rate-limit'

// Always returns an unscoped challenge with an empty allowCredentials list (the
// discoverable-credential flow). The response is byte-identical whether or not
// the email maps to an account, and whether or not that account has a passkey -
// so this route can no longer be used to enumerate registered emails, and it
// never leaks stored credential IDs. The authenticator finds the matching
// resident passkey itself; verify-side looks it up by credential id.
export async function POST(request: NextRequest) {
  const ip = await getClientIp(request)
  const rl = await checkAndRecord('passkey_authenticate', [`ip:${ip}`])
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  try {
    const opts = await createAuthenticationChallenge()
    return NextResponse.json(opts)
  } catch (err: unknown) {
    // Logged as well as returned: the answer only ever reached the sign-in page,
    // so a sign-in that failed every time left nothing in the site's log to say why.
    console.error('[passkey] could not create a sign-in challenge', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to generate challenge' }, { status: 500 })
  }
}
