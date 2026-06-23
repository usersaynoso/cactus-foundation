import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { NEON_REGIONS, type NeonRegionId } from '@/lib/config/neon-regions'
import { triggerVercelRedeploy } from '@/lib/vercel/deploy'

const NEON_API = 'https://console.neon.tech/api/v2'
const VERCEL_API = 'https://api.vercel.com'

// Shape of the Neon create-project response we care about.
type NeonProjectResponse = {
  project: { id: string; name: string; region_id: string }
  connection_uris: Array<{
    connection_uri: string
    connection_parameters: {
      host: string
      pooler_host: string
      database: string
      role: string
      password: string
    }
  }>
}

type NeonProjectListResponse = {
  projects: Array<{ id: string; name: string }>
  pagination?: { cursor?: string }
}

// Derives the pooled connection URI from the Neon response.
// The pooled host is in connection_parameters.pooler_host.
// We rebuild the URL with that host so we're definitely using PgBouncer.
function buildPooledUri(data: NeonProjectResponse): string {
  const params = data.connection_uris[0]?.connection_parameters
  if (!params) throw new Error('Neon response missing connection_parameters')

  const { pooler_host, database, role, password } = params
  if (!pooler_host || !database || !role || !password) {
    throw new Error('Neon response missing required connection fields')
  }

  const encoded = encodeURIComponent(password)
  return `postgresql://${role}:${encoded}@${pooler_host}/${database}?sslmode=require&channel_binding=require`
}

async function findExistingNeonProject(
  apiKey: string,
  projectName: string
): Promise<string | null> {
  const res = await fetch(
    `${NEON_API}/projects?search=${encodeURIComponent(projectName)}&limit=10`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    }
  )
  if (!res.ok) return null
  const data = (await res.json()) as NeonProjectListResponse
  const match = data.projects?.find((p) => p.name === projectName)
  return match?.id ?? null
}

async function createNeonProject(
  apiKey: string,
  projectName: string,
  regionId: NeonRegionId
): Promise<NeonProjectResponse> {
  const res = await fetch(`${NEON_API}/projects`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      project: {
        name: projectName,
        region_id: regionId,
        pg_version: 17,
      },
    }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Neon API error ${res.status}: ${body}`)
  }
  return res.json() as Promise<NeonProjectResponse>
}

async function getNeonProjectConnectionUri(
  apiKey: string,
  projectId: string
): Promise<NeonProjectResponse> {
  // Re-fetch the project to get fresh connection details.
  const res = await fetch(`${NEON_API}/projects/${encodeURIComponent(projectId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    throw new Error(`Neon API error fetching project ${projectId}: ${res.status}`)
  }
  // The single-project response wraps in { project } but doesn't include
  // connection_uris directly. We need to list the project's branches/endpoints
  // and reconstruct. Easiest path: list connection URIs via the connection endpoint.
  const projectRes = await res.json() as { project: { id: string; name: string; region_id: string } }

  // Fetch connection URIs for this project.
  const uriRes = await fetch(
    `${NEON_API}/projects/${encodeURIComponent(projectId)}/connection_uri?database_name=neondb&role_name=neondb_owner`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    }
  )
  if (!uriRes.ok) {
    throw new Error(`Neon API error fetching connection URI: ${uriRes.status}`)
  }
  type UriResponse = {
    uri: string
    connection_parameters: {
      host: string
      pooler_host: string
      database: string
      role: string
      password: string
    }
  }
  const uriData = (await uriRes.json()) as UriResponse
  return {
    project: projectRes.project,
    connection_uris: [
      {
        connection_uri: uriData.uri,
        connection_parameters: uriData.connection_parameters,
      },
    ],
  }
}

// Checks the Vercel project env vars to detect if DATABASE_URL is already written
// (idempotency: provisioning was done in a prior request).
async function vercelDbUrlExists(token: string, projectId: string): Promise<boolean> {
  const res = await fetch(
    `${VERCEL_API}/v10/projects/${encodeURIComponent(projectId)}/env`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    }
  )
  if (!res.ok) return false
  const data = (await res.json()) as { envs?: Array<{ key: string }> }
  return data.envs?.some((e) => e.key === 'DATABASE_URL') ?? false
}

// Writes DATABASE_URL (and optionally NEON_PROJECT_ID) to the Vercel project
// env vars. Writing a new encrypted env var triggers a Vercel redeployment.
async function writeVercelEnvVars(
  token: string,
  projectId: string,
  databaseUrl: string,
  neonProjectId: string
): Promise<void> {
  const vars = [
    {
      key: 'DATABASE_URL',
      value: databaseUrl,
      type: 'encrypted',
      target: ['production', 'preview', 'development'],
    },
    {
      key: 'NEON_PROJECT_ID',
      value: neonProjectId,
      type: 'plain',
      target: ['production', 'preview', 'development'],
    },
  ]

  const res = await fetch(
    `${VERCEL_API}/v10/projects/${encodeURIComponent(projectId)}/env`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(vars),
      signal: AbortSignal.timeout(15_000),
    }
  )
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Vercel API error writing env vars (${res.status}): ${body}`)
  }
}

// Guard: only available before setup is complete.
async function isSetupComplete(): Promise<boolean> {
  try {
    // If DATABASE_URL is not yet set, Prisma can't connect, so setup is not complete.
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

export async function POST(req: NextRequest) {
  // Only available before setup is complete.
  if (await isSetupComplete()) {
    return NextResponse.json({ error: 'Setup is already complete' }, { status: 403 })
  }

  const neonApiKey = process.env.NEON_API_KEY
  const vercelToken = process.env.VERCEL_API_TOKEN
  const vercelProjectId = process.env.VERCEL_PROJECT_ID

  if (!neonApiKey) {
    return NextResponse.json({ error: 'NEON_API_KEY is not configured' }, { status: 400 })
  }
  if (!vercelToken || !vercelProjectId) {
    return NextResponse.json(
      { error: 'VERCEL_API_TOKEN and VERCEL_PROJECT_ID are required' },
      { status: 400 }
    )
  }

  // If DATABASE_URL is already in runtime env, provisioning is not needed.
  if (process.env.DATABASE_URL) {
    return NextResponse.json({ status: 'already_set' })
  }

  // Idempotency check: if DATABASE_URL is already in Vercel project env vars,
  // a prior provisioning succeeded and we're waiting for the redeploy.
  if (await vercelDbUrlExists(vercelToken, vercelProjectId)) {
    return NextResponse.json({ status: 'provisioned-redeploying' })
  }

  // Parse region from body, default to aws-us-east-2.
  let regionId: NeonRegionId = 'aws-us-east-2'
  try {
    const body = (await req.json()) as { region?: string }
    const validRegions = NEON_REGIONS.map((r) => r.id) as string[]
    if (body.region && validRegions.includes(body.region)) {
      regionId = body.region as NeonRegionId
    }
  } catch {
    // No body or invalid JSON — use default region.
  }

  // Derive a stable, identifiable name for the Neon project so we can detect
  // duplicate attempts via the name-search endpoint (idempotency).
  const neonProjectName = `cactus-${vercelProjectId}`

  try {
    // Check whether a Neon project was already created for this Vercel project.
    let neonData: NeonProjectResponse
    const existingId = await findExistingNeonProject(neonApiKey, neonProjectName)

    if (existingId) {
      // Reuse the existing Neon project rather than creating a duplicate.
      neonData = await getNeonProjectConnectionUri(neonApiKey, existingId)
    } else {
      // Create a new Neon project.
      neonData = await createNeonProject(neonApiKey, neonProjectName, regionId)
    }

    // Build the pooled connection string — this is what Cactus will use.
    const pooledUrl = buildPooledUri(neonData)

    // Write DATABASE_URL (and a NEON_PROJECT_ID marker for future idempotency
    // checks) to the Vercel project. This triggers a Vercel redeployment, which
    // will run prisma migrate deploy + module migrations in the build step.
    await writeVercelEnvVars(
      vercelToken,
      vercelProjectId,
      pooledUrl,
      neonData.project.id
    )

    // Trigger a redeploy so the build runs migrations with the new DATABASE_URL.
    // Best-effort — the health-check polling in the wizard handles the wait.
    await triggerVercelRedeploy(vercelToken, vercelProjectId)

    return NextResponse.json({
      status: 'provisioned',
      neonProjectId: neonData.project.id,
      region: neonData.project.region_id,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      {
        status: 'error',
        error: message,
      },
      { status: 500 }
    )
  }
}
