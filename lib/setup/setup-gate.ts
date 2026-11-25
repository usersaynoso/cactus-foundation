import { NextResponse } from 'next/server'
import { prismaGateFailureMeansUnconfigured } from '@/lib/proxy/gate-failure'

// The "is setup still open?" check for the unauthenticated setup routes that act with
// the site's OWN stored credentials (hosting token, Neon key) or report on them.
//
// Each of those routes used to carry its own copy of this check, and every copy turned
// a database read that THREW into "setup is not complete". That is fail-open on the
// one guard standing between an anonymous caller and the site's hosting account. The
// proxy already refuses to collapse "database unreachable" into "never set up" (see the
// first-run gate in proxy.ts) and deliberately lets /api/setup/* through while the read
// fails, so a fresh install's wizard still answers - which left the route's own check
// as the only thing deciding. On a live site, a database restart or a deploy's
// connection sweep was therefore a window in which anybody could write DATABASE_URL to
// the host and redeploy, or rotate ENCRYPTION_KEY and SESSION_SECRET through the
// connect step's `configure`.
//
// So a failed read is told apart the same way the proxy tells it apart
// (lib/proxy/gate-failure.ts): no DATABASE_URL, or a connection with no schema behind
// it, is a genuine first run and the wizard carries on; anything else is an outage on
// a site that may well be set up, and the route refuses until the database answers.
// Nothing the wizard offers is lost by that: once DATABASE_URL is in the environment
// the wizard treats the database step as done and never asks for it again.

export type SetupGateState = 'open' | 'complete' | 'unavailable'

export async function readSetupGate(): Promise<SetupGateState> {
  if (!process.env.DATABASE_URL) return 'open'
  try {
    // Imported lazily: on a fresh install this runs before any database exists, and
    // the routes using it must answer either way.
    const { prisma } = await import('@/lib/db/prisma')
    const config = await prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { setupCompleted: true },
    })
    return config?.setupCompleted ? 'complete' : 'open'
  } catch (err) {
    return prismaGateFailureMeansUnconfigured(err) ? 'open' : 'unavailable'
  }
}

/** null while setup is genuinely open; otherwise the response the route must send. */
export async function setupClosedResponse(): Promise<NextResponse | null> {
  const state = await readSetupGate()
  if (state === 'complete') {
    return NextResponse.json({ error: 'Setup is already complete' }, { status: 403 })
  }
  if (state === 'unavailable') {
    return NextResponse.json(
      { error: "The database isn't answering right now, so setup can't tell whether this site is already set up. Try again in a minute." },
      { status: 503 },
    )
  }
  return null
}
