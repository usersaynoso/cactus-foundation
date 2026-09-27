import { NextResponse } from 'next/server'
import { getSessionWithMeta, msUntilExpiry, touchCurrentSession } from '@/lib/auth/session'
import { errorResponse } from '@/lib/utils'

// The admin shell's line to the session clock (components/admin/SessionExpiryWatcher.tsx).
// Both answers are the time left, as a duration, so the browser can anchor it to
// its own clock rather than trust the server's.

// How long the session in this cookie has left. Read-only on purpose: the watcher
// asks this just before it would warn, to learn whether another tab has kept the
// session going, and asking must not count as using the site - or an idle tab
// would keep itself signed in by checking whether it was still signed in.
export async function GET() {
  const session = await getSessionWithMeta()
  if (!session) return errorResponse('Not authenticated', 401)
  return NextResponse.json(
    { expiresInMs: msUntilExpiry(session.expiresAt) },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}

// Somebody clicked or typed: restart the idle clock.
export async function POST() {
  const expiresAt = await touchCurrentSession()
  if (!expiresAt) return errorResponse('Not authenticated', 401)
  return NextResponse.json(
    { expiresInMs: msUntilExpiry(expiresAt) },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
