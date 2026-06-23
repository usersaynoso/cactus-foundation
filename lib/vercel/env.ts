const VERCEL_API = 'https://api.vercel.com'

type VercelEnvTarget = 'production' | 'preview' | 'development'
type VercelEnvType = 'plain' | 'encrypted'

type VercelEnvVar = {
  id: string
  key: string
  type: VercelEnvType
  target: VercelEnvTarget[]
}

const DEFAULT_TARGETS: VercelEnvTarget[] = ['production', 'preview', 'development']

// Encrypted type for sensitive keys; plain for everything else.
const ENCRYPTED_KEYS = new Set([
  'DATABASE_URL',
  'SESSION_SECRET',
  'VERCEL_API_TOKEN',
  'BREVO_API_KEY',
  'SMTP_PASS',
  'B2_APPLICATION_KEY',
  'GITHUB_API_TOKEN',
  'NEON_API_KEY',
  'EDGE_CONFIG',
  'VERCEL_WEBHOOK_SECRET',
  'TURNSTILE_SECRET_KEY',
])

function envType(key: string): VercelEnvType {
  return ENCRYPTED_KEYS.has(key) ? 'encrypted' : 'plain'
}

// Fetches all env var entries for the project (returns id + key, never value).
async function listVercelEnvVars(token: string, projectId: string): Promise<VercelEnvVar[]> {
  const res = await fetch(
    `${VERCEL_API}/v10/projects/${encodeURIComponent(projectId)}/env`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    }
  )
  if (!res.ok) {
    throw new Error(`Vercel API list env vars failed (${res.status})`)
  }
  const data = (await res.json()) as { envs?: VercelEnvVar[] }
  return data.envs ?? []
}

// Returns the set of env var keys currently set in the Vercel project.
export async function getVercelEnvVarKeys(token: string, projectId: string): Promise<string[]> {
  const vars = await listVercelEnvVars(token, projectId)
  return vars.map((v) => v.key)
}

// Upserts a single env var: PATCHes if the key already exists, POSTs to create otherwise.
export async function upsertVercelEnvVar(
  token: string,
  projectId: string,
  key: string,
  value: string,
  type?: VercelEnvType
): Promise<void> {
  const resolvedType = type ?? envType(key)
  const vars = await listVercelEnvVars(token, projectId)
  const existing = vars.find((v) => v.key === key)

  if (existing) {
    const res = await fetch(
      `${VERCEL_API}/v10/projects/${encodeURIComponent(projectId)}/env/${existing.id}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value, type: resolvedType, target: DEFAULT_TARGETS }),
        signal: AbortSignal.timeout(15_000),
      }
    )
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Vercel PATCH env var "${key}" failed (${res.status}): ${body}`)
    }
  } else {
    const res = await fetch(
      `${VERCEL_API}/v10/projects/${encodeURIComponent(projectId)}/env`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          { key, value, type: resolvedType, target: DEFAULT_TARGETS },
        ]),
        signal: AbortSignal.timeout(15_000),
      }
    )
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Vercel POST env var "${key}" failed (${res.status}): ${body}`)
    }
  }
}

// Batch upsert. Fetches the var list once, then creates/updates each key.
export async function upsertVercelEnvVars(
  token: string,
  projectId: string,
  vars: Array<{ key: string; value: string; type?: VercelEnvType }>
): Promise<void> {
  const existing = await listVercelEnvVars(token, projectId)
  const existingMap = new Map(existing.map((v) => [v.key, v.id]))

  await Promise.all(
    vars.map(async ({ key, value, type }) => {
      const resolvedType = type ?? envType(key)
      const existingId = existingMap.get(key)

      if (existingId) {
        const res = await fetch(
          `${VERCEL_API}/v10/projects/${encodeURIComponent(projectId)}/env/${existingId}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ value, type: resolvedType, target: DEFAULT_TARGETS }),
            signal: AbortSignal.timeout(15_000),
          }
        )
        if (!res.ok) {
          const body = await res.text()
          throw new Error(`Vercel PATCH env var "${key}" failed (${res.status}): ${body}`)
        }
      } else {
        const res = await fetch(
          `${VERCEL_API}/v10/projects/${encodeURIComponent(projectId)}/env`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify([
              { key, value, type: resolvedType, target: DEFAULT_TARGETS },
            ]),
            signal: AbortSignal.timeout(15_000),
          }
        )
        if (!res.ok) {
          const body = await res.text()
          throw new Error(`Vercel POST env var "${key}" failed (${res.status}): ${body}`)
        }
      }
    })
  )
}
