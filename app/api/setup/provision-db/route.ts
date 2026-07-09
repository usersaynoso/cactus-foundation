import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { isLocalMode } from '@/lib/config/env'
import { NEON_REGIONS, type NeonRegionId } from '@/lib/config/neon-regions'
import { triggerVercelRedeploy, ensureVercelRedeploy, type RedeployResult } from '@/lib/vercel/deploy'
import { upsertVercelEnvVars } from '@/lib/vercel/env'
import { Client } from 'pg'

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

// Derives the pooled connection URI from a Neon create-project response.
// Only used for freshly created projects where connection_parameters is present.
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

// Returns the first org_id for the authenticated user, or null for legacy personal accounts.
async function getNeonOrgId(apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(`${NEON_API}/users/me/organizations`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { organizations?: Array<{ id: string }> }
    return data.organizations?.[0]?.id ?? null
  } catch {
    return null
  }
}

async function findExistingNeonProject(
  apiKey: string,
  projectName: string,
  orgId: string | null
): Promise<string | null> {
  const url = new URL(`${NEON_API}/projects`)
  url.searchParams.set('search', projectName)
  url.searchParams.set('limit', '10')
  if (orgId) url.searchParams.set('org_id', orgId)
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) return null
  const data = (await res.json()) as NeonProjectListResponse
  const match = data.projects?.find((p) => p.name === projectName)
  return match?.id ?? null
}

async function createNeonProject(
  apiKey: string,
  projectName: string,
  regionId: NeonRegionId,
  orgId: string | null
): Promise<NeonProjectResponse> {
  const projectBody: Record<string, unknown> = {
    name: projectName,
    region_id: regionId,
    pg_version: 18,
  }
  if (orgId) projectBody.org_id = orgId
  const res = await fetch(`${NEON_API}/projects`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ project: projectBody }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Neon API error ${res.status}: ${body}`)
  }
  return res.json() as Promise<NeonProjectResponse>
}

// Fetches the pooled connection URI for an existing Neon project using the
// pooled=true parameter, which returns the PgBouncer connection string directly
// without requiring connection_parameters in the response.
async function getPooledUriForProject(
  apiKey: string,
  projectId: string
): Promise<{ pooledUri: string; project: { id: string; name: string; region_id: string } }> {
  const projectRes = await fetch(`${NEON_API}/projects/${encodeURIComponent(projectId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (!projectRes.ok) {
    throw new Error(`Neon API error fetching project: ${projectRes.status}`)
  }
  const projectData = (await projectRes.json()) as {
    project: { id: string; name: string; region_id: string }
  }

  const uriRes = await fetch(
    `${NEON_API}/projects/${encodeURIComponent(projectId)}/connection_uri?database_name=neondb&role_name=neondb_owner&pooled=true`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    }
  )
  if (!uriRes.ok) {
    throw new Error(`Neon API error fetching connection URI: ${uriRes.status}`)
  }
  const uriData = (await uriRes.json()) as { uri?: string }
  if (!uriData.uri) throw new Error('Neon response missing connection URI')

  // Ensure required query params for Neon pooler compatibility.
  const url = new URL(uriData.uri)
  if (!url.searchParams.has('sslmode')) url.searchParams.set('sslmode', 'require')
  if (!url.searchParams.has('channel_binding')) url.searchParams.set('channel_binding', 'require')

  return { pooledUri: url.toString(), project: projectData.project }
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

// Writes DATABASE_URL (and optionally NEON_PROJECT_ID) to the Vercel project env
// vars via the shared upsert helper: overwrites stale values from prior attempts
// and skips the "development" target on sensitive vars, which Vercel rejects.
async function writeVercelEnvVars(
  token: string,
  projectId: string,
  databaseUrl: string,
  neonProjectId?: string
): Promise<void> {
  const vars: Array<{ key: string; value: string; type?: 'plain' | 'sensitive' }> = [
    { key: 'DATABASE_URL', value: databaseUrl, type: 'sensitive' },
  ]
  if (neonProjectId) {
    vars.push({ key: 'NEON_PROJECT_ID', value: neonProjectId, type: 'plain' })
  }
  await upsertVercelEnvVars(token, projectId, vars)
}

// Shapes the redeploy portion of a provisioning response: the connection string
// is written either way, but a failed trigger must reach the UI instead of being
// silently reported as "redeploying".
function redeployFields(result: RedeployResult): {
  deploymentId?: string
  redeployError?: string
} {
  return result.triggered
    ? { deploymentId: result.deploymentId }
    : { redeployError: result.error ?? 'Failed to start the redeploy' }
}

// Drops all user-created objects by resetting the public schema.
// Uses a direct (non-pooler) connection since DDL is not safe through pgBouncer.
async function dropAllSchemas(connectionUri: string): Promise<void> {
  const directUri = connectionUri.includes('-pooler.')
    ? connectionUri.replace('-pooler.', '.')
    : connectionUri
  const client = new Client({ connectionString: directUri, connectionTimeoutMillis: 15_000, statement_timeout: 30_000 })
  try {
    await client.connect()
    await client.query('DROP SCHEMA public CASCADE')
    await client.query('CREATE SCHEMA public')
    await client.query('GRANT ALL ON SCHEMA public TO PUBLIC')
  } finally {
    await client.end().catch(() => {})
  }
}

// Guard: only available before setup is complete.
// Connects to the given database URL and counts user-created tables.
// Returns true if the database already has tables (i.e. existing data/schema).
async function checkDatabaseHasExistingData(connectionUri: string): Promise<boolean> {
  const client = new Client({ connectionString: connectionUri, connectionTimeoutMillis: 8_000, statement_timeout: 5_000 })
  try {
    await client.connect()
    const res = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM information_schema.tables
       WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')`
    )
    return parseInt(res.rows[0]?.count ?? '0', 10) > 0
  } finally {
    await client.end().catch(() => {})
  }
}

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

export async function POST(req: NextRequest) {
  if (await isSetupComplete()) {
    return NextResponse.json({ error: 'Setup is already complete' }, { status: 403 })
  }

  // Database provisioning writes DATABASE_URL to Vercel and triggers a redeploy -
  // neither exists in local-development mode. Set DATABASE_URL in .env.local instead.
  if (isLocalMode()) {
    return NextResponse.json(
      { status: 'error', error: 'Database provisioning is not available in local-development mode. Set DATABASE_URL in .env.local, run npm run db:migrate, and restart.' },
      { status: 400 }
    )
  }

  // Parse action and optional credential overrides from body.
  // Credentials may be supplied in the body when the Vercel redeploy that picks
  // them up as env vars hasn't happened yet (combined first-redeploy flow).
  let body: {
    action?: string
    region?: string
    projectId?: string
    databaseUrl?: string
    destroyData?: boolean
    neonApiKey?: string
    vercelToken?: string
    vercelProjectId?: string
  } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    // No body or invalid JSON — default to 'create'.
  }
  const action = body.action ?? 'create'

  // Resolve credentials: body params override env vars to support the single-redeploy
  // setup flow where bootstrap vars haven't been picked up by a redeploy yet.
  const neonApiKey = body.neonApiKey?.trim() || process.env.NEON_API_KEY
  const vercelToken = body.vercelToken || process.env.VERCEL_API_TOKEN
  const vercelProjectId = body.vercelProjectId || process.env.VERCEL_PROJECT_ID

  // ── Action: list ──────────────────────────────────────────────────────────
  if (action === 'list') {
    if (!neonApiKey) {
      return NextResponse.json({ error: 'NEON_API_KEY is not configured' }, { status: 400 })
    }
    try {
      // New Neon accounts use org-scoped projects — fetch orgs first.
      const orgsRes = await fetch(`${NEON_API}/users/me/organizations`, {
        headers: { Authorization: `Bearer ${neonApiKey}` },
        signal: AbortSignal.timeout(10_000),
      })
      if (orgsRes.ok) {
        const orgsData = (await orgsRes.json()) as { organizations?: Array<{ id: string; name: string }> }
        const orgs = orgsData.organizations ?? []
        if (orgs.length > 0) {
          const projectLists = await Promise.all(
            orgs.map(async (org) => {
              try {
                const r = await fetch(`${NEON_API}/projects?org_id=${encodeURIComponent(org.id)}&limit=100`, {
                  headers: { Authorization: `Bearer ${neonApiKey}` },
                  signal: AbortSignal.timeout(10_000),
                })
                if (!r.ok) return []
                const d = (await r.json()) as NeonProjectListResponse
                return d.projects?.map((p) => ({ id: p.id, name: p.name })) ?? []
              } catch {
                return []
              }
            })
          )
          return NextResponse.json({ projects: projectLists.flat() })
        }
      }
      // Fallback for legacy personal accounts (no orgs).
      const res = await fetch(`${NEON_API}/projects?limit=100`, {
        headers: { Authorization: `Bearer ${neonApiKey}` },
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) {
        const text = await res.text()
        return NextResponse.json({ error: `Neon API error ${res.status}: ${text}` }, { status: 502 })
      }
      const data = (await res.json()) as NeonProjectListResponse
      return NextResponse.json({ projects: data.projects?.map((p) => ({ id: p.id, name: p.name })) ?? [] })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  // ── Action: check-existing ────────────────────────────────────────────────
  // Must be handled before any DATABASE_URL or Vercel credential guards, since
  // it only needs the Neon API key and must not short-circuit on already_set.
  if (action === 'check-existing') {
    if (!neonApiKey) {
      return NextResponse.json({ error: 'NEON_API_KEY is not configured' }, { status: 400 })
    }
    const existingProjectId = body.projectId
    if (!existingProjectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }
    try {
      const { pooledUri } = await getPooledUriForProject(neonApiKey, existingProjectId)
      const hasExistingData = await checkDatabaseHasExistingData(pooledUri)
      return NextResponse.json({ hasExistingData })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return NextResponse.json({ hasExistingData: false, warning: message })
    }
  }

  // ── Actions that need Vercel credentials ─────────────────────────────────
  if (!vercelToken || !vercelProjectId) {
    return NextResponse.json(
      { error: 'VERCEL_API_TOKEN and VERCEL_PROJECT_ID are required' },
      { status: 400 }
    )
  }

  // ── Action: save-url (user-supplied DATABASE_URL) ─────────────────────────
  if (action === 'save-url') {
    const { databaseUrl } = body
    if (!databaseUrl) {
      return NextResponse.json({ error: 'databaseUrl is required' }, { status: 400 })
    }
    if (!databaseUrl.startsWith('postgres://') && !databaseUrl.startsWith('postgresql://')) {
      return NextResponse.json(
        { error: 'Must be a PostgreSQL connection string (postgres:// or postgresql://)' },
        { status: 400 }
      )
    }
    try {
      await upsertVercelEnvVars(vercelToken, vercelProjectId, [
        { key: 'DATABASE_URL', value: databaseUrl, type: 'sensitive' },
      ])
      const deployResult0 = await triggerVercelRedeploy(vercelToken, vercelProjectId)
      return NextResponse.json({ status: 'provisioned', ...redeployFields(deployResult0) })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return NextResponse.json({ status: 'error', error: message }, { status: 500 })
    }
  }

  // If DATABASE_URL is already in runtime env, provisioning is not needed.
  if (process.env.DATABASE_URL) {
    return NextResponse.json({ status: 'already_set' })
  }

  // ── Action: ensure-redeploy ───────────────────────────────────────────────
  // Called when the wizard finds DATABASE_URL already written to Vercel but not
  // yet in the runtime env. Guarantees a redeploy is actually in flight: reuses
  // a running deployment if there is one, otherwise triggers a fresh one. This
  // self-heals the stuck state where an earlier trigger failed (or the deploy
  // errored) and the UI would otherwise wait forever on a redeploy that never runs.
  if (action === 'ensure-redeploy') {
    if (!(await vercelDbUrlExists(vercelToken, vercelProjectId))) {
      // Nothing provisioned after all — send the wizard back to the choice panel.
      return NextResponse.json({ status: 'missing' })
    }
    const ensureResult = await ensureVercelRedeploy(vercelToken, vercelProjectId)
    return NextResponse.json({ status: 'provisioned', ...redeployFields(ensureResult) })
  }

  // Note: no short-circuit on DATABASE_URL already existing in the Vercel project
  // env vars. A stale value from a prior attempt must not turn an explicit
  // provisioning request into a silent no-op — the upsert overwrites it and a
  // fresh redeploy picks it up.

  // For Neon actions we need the API key.
  if (!neonApiKey) {
    return NextResponse.json({ error: 'NEON_API_KEY is not configured' }, { status: 400 })
  }

  // ── Action: use-existing ──────────────────────────────────────────────────
  if (action === 'use-existing') {
    const existingProjectId = body.projectId
    if (!existingProjectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }
    try {
      const { pooledUri, project } = await getPooledUriForProject(neonApiKey, existingProjectId)
      if (body.destroyData) {
        await dropAllSchemas(pooledUri)
      }
      await writeVercelEnvVars(vercelToken, vercelProjectId, pooledUri, project.id)
      const deployResult1 = await triggerVercelRedeploy(vercelToken, vercelProjectId)
      return NextResponse.json({ status: 'provisioned', neonProjectId: project.id, ...redeployFields(deployResult1) })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return NextResponse.json({ status: 'error', error: message }, { status: 500 })
    }
  }

  // ── Action: create (default) ──────────────────────────────────────────────

  // Parse region, default to aws-us-east-2.
  let regionId: NeonRegionId = 'aws-us-east-2'
  const validRegions = NEON_REGIONS.map((r) => r.id) as string[]
  if (body.region && validRegions.includes(body.region)) {
    regionId = body.region as NeonRegionId
  }

  // Derive a stable, identifiable name for the Neon project so we can detect
  // duplicate attempts via the name-search endpoint (idempotency).
  const neonProjectName = `cactus-${vercelProjectId}`

  try {
    const orgId = await getNeonOrgId(neonApiKey)
    const existingId = await findExistingNeonProject(neonApiKey, neonProjectName, orgId)

    if (existingId) {
      // Reuse the existing project — fetch pooled URI via pooled=true endpoint.
      const { pooledUri, project } = await getPooledUriForProject(neonApiKey, existingId)
      await writeVercelEnvVars(vercelToken, vercelProjectId, pooledUri, project.id)
      const deployResult2 = await triggerVercelRedeploy(vercelToken, vercelProjectId)
      return NextResponse.json({
        status: 'provisioned',
        neonProjectId: project.id,
        region: project.region_id,
        ...redeployFields(deployResult2),
      })
    }

    // Create a new Neon project — the create response includes connection_parameters.
    const neonData = await createNeonProject(neonApiKey, neonProjectName, regionId, orgId)
    const pooledUrl = buildPooledUri(neonData)
    await writeVercelEnvVars(vercelToken, vercelProjectId, pooledUrl, neonData.project.id)
    const deployResult3 = await triggerVercelRedeploy(vercelToken, vercelProjectId)
    return NextResponse.json({
      status: 'provisioned',
      neonProjectId: neonData.project.id,
      region: neonData.project.region_id,
      ...redeployFields(deployResult3),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ status: 'error', error: message }, { status: 500 })
  }
}
