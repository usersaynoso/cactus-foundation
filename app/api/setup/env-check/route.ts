import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getEnvStatus, requiredEnvMissing, isLocalMode } from '@/lib/config/env'

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
// 'provisioned-redeploying' - DATABASE_URL was written to the Vercel project env vars
//                            by a previous provisioning attempt, but the redeploy that
//                            picks it up hasn't finished yet
// 'missing'                - DATABASE_URL is not set anywhere we can detect
export type DatabaseState = 'set' | 'provisioned-redeploying' | 'missing'

async function resolveDatabaseState(): Promise<DatabaseState> {
  if (process.env.DATABASE_URL) return 'set'

  const token = process.env.VERCEL_API_TOKEN
  const projectId = process.env.VERCEL_PROJECT_ID
  if (!token || !projectId) return 'missing'

  try {
    const res = await fetch(
      `https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/env`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8_000),
      }
    )
    if (!res.ok) return 'missing'
    const data = (await res.json()) as { envs?: Array<{ key: string }> }
    const hasDbUrl = data.envs?.some((e) => e.key === 'DATABASE_URL') ?? false
    return hasDbUrl ? 'provisioned-redeploying' : 'missing'
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
  // In local mode there is no Vercel project to connect, so report the gate as
  // satisfied: the wizard then skips the connect step and goes straight to the
  // database step (which expects DATABASE_URL in .env.local).
  const vercelConfigured =
    localMode || !!(process.env.VERCEL_API_TOKEN && process.env.VERCEL_PROJECT_ID)

  return NextResponse.json({
    required,
    optional,
    missingRequired,
    databaseState,
    neonAvailable: !!process.env.NEON_API_KEY,
    vercelConfigured,
    localMode,
    // Read fresh from the running server on every request, unlike the client's
    // NEXT_PUBLIC_SITE_URL, which is baked into the JS bundle at build time and
    // stays stale in an already-open wizard tab until the page is reloaded.
    siteUrl: process.env.SITE_URL ?? null,
  })
}
