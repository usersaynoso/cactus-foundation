import { NextResponse } from 'next/server'
import { getEnvStatus, requiredEnvMissing } from '@/lib/config/env'

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
  const { required, optional } = getEnvStatus()
  const missingRequired = requiredEnvMissing()
  const databaseState = await resolveDatabaseState()

  return NextResponse.json({
    required,
    optional,
    missingRequired,
    databaseState,
    neonAvailable: !!process.env.NEON_API_KEY,
  })
}
