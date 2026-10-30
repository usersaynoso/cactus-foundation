import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getEnvStatus, requiredEnvMissing, isLocalMode } from '@/lib/config/env'
import { detectHostingProvider, getHostingCredentials } from '@/lib/hosting/provider'
import { getHostEnvVarKeys } from '@/lib/hosting/env'

async function isSetupComplete(): Promise<boolean> {
  try {
    if (!process.env.DATABASE_URL) return false
    const config = await prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { setupCompleted: true },
    })
    return config?.setupCompleted ?? false
  } catch {
    return false
  }
}

// 'set'                    - DATABASE_URL is in runtime process.env — normal path
// 'provisioned-redeploying' - DATABASE_URL was written to the hosting project's env vars
//                            by a previous provisioning attempt, but the redeploy that
//                            picks it up hasn't finished yet
// 'missing'                - DATABASE_URL is not set anywhere we can detect
export type DatabaseState = 'set' | 'provisioned-redeploying' | 'missing'

async function resolveDatabaseState(): Promise<DatabaseState> {
  if (process.env.DATABASE_URL) return 'set'

  const creds = getHostingCredentials()
  if (!creds) return 'missing'

  try {
    const keys = await getHostEnvVarKeys(creds)
    return keys.includes('DATABASE_URL') ? 'provisioned-redeploying' : 'missing'
  } catch {
    return 'missing'
  }
}

export async function GET() {
  if (await isSetupComplete()) {
    return NextResponse.json({ error: 'Setup is already complete' }, { status: 403 })
  }

  const { required, optional } = getEnvStatus()
  const missingRequired = requiredEnvMissing()
  const databaseState = await resolveDatabaseState()
  const localMode = isLocalMode()
  // In local mode there is no hosting project to connect, so report the gate as
  // satisfied: the wizard then skips the connect step and goes straight to the
  // database step (which expects DATABASE_URL in .env.local).
  const credentials = getHostingCredentials()
  // On Vercel and Netlify the credential only exists once the connect step has
  // written it, so "have credentials" means "connected". On a server cactus-host put
  // the credential there before the first build, so it says nothing about whether the
  // connect step (domain, SITE_URL, the site's own secrets) has run - SITE_URL does.
  const hostingConfigured =
    localMode || (!!credentials && (credentials.provider !== 'server' || !!process.env.SITE_URL))

  return NextResponse.json({
    required,
    optional,
    missingRequired,
    databaseState,
    neonAvailable: !!process.env.NEON_API_KEY,
    hostingConfigured,
    // The platform this site is running on (null locally), so the wizard can
    // preselect it; and the one its saved credentials are for, once connected.
    detectedHost: detectHostingProvider(),
    hostingProvider: credentials?.provider ?? null,
    localMode,
    // Read fresh from the running server on every request, unlike the client's
    // NEXT_PUBLIC_SITE_URL, which is baked into the JS bundle at build time and
    // stays stale in an already-open wizard tab until the page is reloaded.
    siteUrl: process.env.SITE_URL ?? null,
  })
}
