import { prisma } from '@/lib/db/prisma'

// The first-run bootstrap window.
//
// It is the only moment a client-supplied userId may be trusted without a
// session, because during setup no session can exist yet: the wizard creates the
// admin account and then immediately enrols its first passkey / TOTP secret.
//
// Outside that window every identity claim MUST come from the session cookie.
// Trusting a body userId after setup is account takeover: the attacker names the
// victim, enrols their own authenticator against it, and signs in.
//
// The rule mirrors the guard in /api/setup/create-admin, so the window opens and
// closes in exactly one place: once setup is marked complete AND at least one
// user exists, the door is shut. (userCount is part of the test so the
// /api/setup/reset recovery path — which deletes every user but leaves
// setupCompleted set — can still re-run the wizard.)
export async function isSetupBootstrapOpen(): Promise<boolean> {
  const [cfg, userCount] = await Promise.all([
    prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { setupCompleted: true },
    }),
    prisma.user.count(),
  ])
  return !(cfg?.setupCompleted && userCount > 0)
}
